use crate::models::{MqttSpotRaw, Spot};
use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

pub struct MqttManager {
    client: AsyncClient,
    active_callsign: Arc<Mutex<Option<String>>>,
}

impl MqttManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let client_id = format!("pskmap-{}", rand_suffix());
        let mut opts = MqttOptions::new(client_id, "mqtt.pskreporter.info", 1883);
        opts.set_keep_alive(std::time::Duration::from_secs(60));
        opts.set_clean_session(true);

        let (client, eventloop) = AsyncClient::new(opts, 512);
        let client_for_resub = client.clone();
        let active_callsign = Arc::new(Mutex::new(None::<String>));
        let task_callsign = active_callsign.clone();

        // Spawn the event loop on Tauri's async runtime
        tauri::async_runtime::spawn(Self::run_event_loop(
            eventloop,
            app_handle,
            client_for_resub,
            task_callsign,
        ));

        MqttManager {
            client,
            active_callsign,
        }
    }

    async fn run_event_loop(
        mut eventloop: rumqttc::EventLoop,
        app_handle: AppHandle,
        client: AsyncClient,
        active_callsign: Arc<Mutex<Option<String>>>,
    ) {
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::Publish(msg))) => {
                    match serde_json::from_slice::<MqttSpotRaw>(&msg.payload) {
                        Ok(raw) => {
                            let spot: Spot = raw.into();
                            let _ = app_handle.emit("spot", &spot);
                        }
                        Err(e) => {
                            println!("[PSKmap] MQTT parse error: {}", e);
                        }
                    }
                }
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    println!("[PSKmap] MQTT connected");
                    let _ = app_handle.emit("mqtt-status", "connected");
                    // Re-subscribe on reconnect
                    let topic = {
                        let guard = active_callsign.lock().await;
                        guard.as_ref().map(|cs| format!("pskr/filter/v2/+/+/{}/#", cs))
                    };
                    if let Some(topic) = topic {
                        println!("[PSKmap] Re-subscribing to {}", topic);
                        let _ = client.subscribe(&topic, QoS::AtMostOnce).await;
                    }
                }
                Err(e) => {
                    println!("[PSKmap] MQTT error: {}", e);
                    let _ = app_handle.emit("mqtt-status", "disconnected");
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
                _ => {}
            }
        }
    }

    pub async fn subscribe(&self, callsign: &str) -> Result<(), String> {
        let callsign = callsign.to_uppercase();

        // Check if already subscribed to same callsign
        {
            let guard = self.active_callsign.lock().await;
            if guard.as_deref() == Some(callsign.as_str()) {
                return Ok(());
            }
        }

        // Unsubscribe from previous callsign if any
        {
            let guard = self.active_callsign.lock().await;
            if let Some(ref old) = *guard {
                let old_topic = format!("pskr/filter/v2/+/+/{}/#", old);
                println!("[PSKmap] Unsubscribing from {}", old_topic);
                let _ = self.client.unsubscribe(&old_topic).await;
            }
        }

        let new_topic = format!("pskr/filter/v2/+/+/{}/#", callsign);
        println!("[PSKmap] Subscribing to {}", new_topic);
        self.client
            .subscribe(&new_topic, QoS::AtMostOnce)
            .await
            .map_err(|e| format!("Subscribe failed: {}", e))?;

        {
            let mut guard = self.active_callsign.lock().await;
            *guard = Some(callsign);
        }

        Ok(())
    }

    pub async fn unsubscribe(&self) -> Result<(), String> {
        let old_topic = {
            let guard = self.active_callsign.lock().await;
            guard.as_ref().map(|old| format!("pskr/filter/v2/+/+/{}/#", old))
        };

        if let Some(ref topic) = old_topic {
            let _ = self.client.unsubscribe(topic).await;
        }

        {
            let mut guard = self.active_callsign.lock().await;
            *guard = None;
        }

        Ok(())
    }
}

fn rand_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:08x}", n)
}
