use crate::models::{grid_to_latlon, haversine_km, Spot, SpotQuery};
use serde::Deserialize;

/// Shared HTTP client — reused across all requests to keep connections alive.
static HTTP_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .gzip(true)
            .build()
            .expect("Failed to build HTTP client")
    })
}

/// Result of a backfill fetch: spots + optional sequence number for incremental pulls.
pub struct BackfillResult {
    pub spots: Vec<Spot>,
    pub last_sequence_number: Option<u64>,
}

/// JSONP response structure from pskquery5.pl with callback=doNothing
#[derive(Deserialize)]
struct PskResponse {
    #[serde(default, rename = "receptionReport")]
    reception_report: Vec<PskSpot>,
    #[serde(default, rename = "lastSequenceNumber")]
    last_sequence_number: Option<u64>,
}

#[derive(Deserialize)]
struct PskSpot {
    #[serde(rename = "senderCallsign")]
    sender_callsign: Option<String>,
    #[serde(rename = "receiverCallsign")]
    receiver_callsign: Option<String>,
    #[serde(rename = "senderLocator")]
    sender_locator: Option<String>,
    #[serde(rename = "receiverLocator")]
    receiver_locator: Option<String>,
    frequency: Option<u64>,
    mode: Option<String>,
    #[serde(rename = "sNR")]
    snr: Option<i32>,
    #[serde(rename = "flowStartSeconds")]
    flow_start_seconds: Option<i64>,
    #[serde(rename = "receiverDXCC")]
    receiver_dxcc: Option<String>,
    #[serde(rename = "receiverDXCCCode")]
    receiver_dxcc_code: Option<String>,
    #[serde(rename = "senderLotwUpload")]
    sender_lotw_upload: Option<String>,
}

/// Fetch spots via HTTP. If `last_seq_no` is provided, does an incremental fetch;
/// otherwise pulls the full 24h backfill.
pub async fn fetch_spots_http(
    query: &SpotQuery,
    last_seq_no: Option<u64>,
) -> Result<BackfillResult, String> {
    let callsign = &query.callsign;

    let time_param = match last_seq_no {
        Some(seq) => format!("lastseqno={}", seq),
        None => "flowStartSeconds=-86400".to_string(),
    };

    let url = format!(
        "https://pskreporter.info/cgi-bin/pskquery5.pl?callback=doNothing&mc_version=2025.11.28.1033&pskvers=2025.11.28.1032&statistics=1&noactive=1&nolocator=1&{}&senderCallsign={}",
        time_param,
        urlencoding::encode(callsign),
    );

    let mode = if last_seq_no.is_some() {
        "incremental"
    } else {
        "full"
    };
    println!("[PSKmap] HTTP backfill ({}): {}", mode, url);

    let client = get_client();
    let resp = client
        .get(&url)
        .header("referer", "https://pskreporter.info/pskmap.html")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let _body = resp.text().await.unwrap_or_default();
        return Err(format!("PSKreporter returned status {}", status));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    println!("[PSKmap] HTTP response: {} bytes", body.len());

    // Rate limit returns a JSON object with "message" key
    if body.trim_start().starts_with('{') {
        return Err("PSKreporter rate limit — backfill will retry on next subscribe".to_string());
    }

    parse_jsonp_response(&body)
}

fn parse_jsonp_response(body: &str) -> Result<BackfillResult, String> {
    // Strip JSONP wrapper: doNothing({ ... })
    let json = body
        .find('(')
        .and_then(|start| body.rfind(')').map(|end| &body[start + 1..end]))
        .ok_or_else(|| "Invalid JSONP response".to_string())?;

    let response: PskResponse =
        serde_json::from_str(json).map_err(|e| format!("JSON parse error: {}", e))?;

    let total = response.reception_report.len();
    let last_seq = response.last_sequence_number;

    let spots: Vec<Spot> = response
        .reception_report
        .into_iter()
        .filter_map(|s| {
            let sender_callsign = s.sender_callsign.filter(|v| !v.is_empty())?;
            let receiver_callsign = s.receiver_callsign.filter(|v| !v.is_empty())?;

            let sender_locator = s.sender_locator.filter(|v| !v.is_empty());
            let receiver_locator = s.receiver_locator.filter(|v| !v.is_empty());

            let sender_pos = sender_locator.as_deref().and_then(grid_to_latlon);
            let receiver_pos = receiver_locator.as_deref().and_then(grid_to_latlon);

            let distance_km = match (sender_pos, receiver_pos) {
                (Some((lat1, lon1)), Some((lat2, lon2))) => {
                    Some(haversine_km(lat1, lon1, lat2, lon2))
                }
                _ => None,
            };

            Some(Spot {
                sender_callsign,
                receiver_callsign,
                sender_locator,
                receiver_locator,
                frequency: s.frequency.unwrap_or(0),
                mode: s.mode.unwrap_or_default(),
                snr: s.snr,
                timestamp: s.flow_start_seconds,
                sender_lat: sender_pos.map(|(lat, _)| lat),
                sender_lon: sender_pos.map(|(_, lon)| lon),
                receiver_lat: receiver_pos.map(|(lat, _)| lat),
                receiver_lon: receiver_pos.map(|(_, lon)| lon),
                distance_km,
                receiver_dxcc: s.receiver_dxcc,
                receiver_dxcc_code: s.receiver_dxcc_code,
                sender_lotw_upload: s.sender_lotw_upload,
                decoder_software: None,
                antenna_information: None,
                rig_information: None,
                region: None,
            })
        })
        .collect();

    println!(
        "[PSKmap] JSONP parsed: {} receptionReport → {} spots, lastSeqNo: {:?}",
        total,
        spots.len(),
        last_seq
    );

    Ok(BackfillResult {
        spots,
        last_sequence_number: last_seq,
    })
}
