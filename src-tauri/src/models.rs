use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotQuery {
    pub callsign: String,
    pub band: Option<String>,
    pub mode: Option<String>,
    pub time_range_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Spot {
    pub sender_callsign: String,
    pub receiver_callsign: String,
    pub sender_locator: Option<String>,
    pub receiver_locator: Option<String>,
    pub frequency: u64,
    pub mode: String,
    pub snr: Option<i32>,
    pub timestamp: Option<i64>,
    pub sender_lat: Option<f64>,
    pub sender_lon: Option<f64>,
    pub receiver_lat: Option<f64>,
    pub receiver_lon: Option<f64>,
    pub distance_km: Option<f64>,
    // From receptionReport
    pub receiver_dxcc: Option<String>,
    pub receiver_dxcc_code: Option<String>,
    pub sender_lotw_upload: Option<String>,
    // From activeReceiver (enriched onto matching spots, or standalone)
    pub decoder_software: Option<String>,
    pub antenna_information: Option<String>,
    pub rig_information: Option<String>,
    pub region: Option<String>,
}

/// Raw MQTT JSON payload from pskr/filter/v2 topic.
#[derive(Debug, Deserialize)]
pub struct MqttSpotRaw {
    pub sq: u64,
    pub f: u64,
    pub md: String,
    pub rp: Option<i32>,
    pub t: Option<i64>,
    pub sc: String,
    pub sl: Option<String>,
    pub rc: String,
    pub rl: Option<String>,
    pub sa: Option<u32>,
    pub ra: Option<u32>,
    pub b: Option<String>,
}

impl From<MqttSpotRaw> for Spot {
    fn from(raw: MqttSpotRaw) -> Self {
        let sender_pos = raw.sl.as_deref().and_then(grid_to_latlon);
        let receiver_pos = raw.rl.as_deref().and_then(grid_to_latlon);
        let distance_km = match (sender_pos, receiver_pos) {
            (Some((lat1, lon1)), Some((lat2, lon2))) => Some(haversine_km(lat1, lon1, lat2, lon2)),
            _ => None,
        };

        Spot {
            sender_callsign: raw.sc,
            receiver_callsign: raw.rc,
            sender_locator: raw.sl,
            receiver_locator: raw.rl,
            frequency: raw.f,
            mode: raw.md,
            snr: raw.rp,
            timestamp: raw.t,
            sender_lat: sender_pos.map(|(lat, _)| lat),
            sender_lon: sender_pos.map(|(_, lon)| lon),
            receiver_lat: receiver_pos.map(|(lat, _)| lat),
            receiver_lon: receiver_pos.map(|(_, lon)| lon),
            distance_km,
            receiver_dxcc: None,
            receiver_dxcc_code: None,
            sender_lotw_upload: None,
            decoder_software: None,
            antenna_information: None,
            rig_information: None,
            region: None,
        }
    }
}

/// Convert a Maidenhead grid locator (4 or 6 char) to (lat, lon) at the center of the square.
pub fn grid_to_latlon(grid: &str) -> Option<(f64, f64)> {
    let grid = grid.to_uppercase();
    let chars: Vec<char> = grid.chars().collect();
    if chars.len() < 4 {
        return None;
    }

    let a = chars[0] as i32 - 'A' as i32;
    let b = chars[1] as i32 - 'A' as i32;
    if a < 0 || a > 17 || b < 0 || b > 17 {
        return None;
    }

    let c = chars[2] as i32 - '0' as i32;
    let d = chars[3] as i32 - '0' as i32;
    if c < 0 || c > 9 || d < 0 || d > 9 {
        return None;
    }

    let mut lon = (a as f64) * 20.0 - 180.0 + (c as f64) * 2.0;
    let mut lat = (b as f64) * 10.0 - 90.0 + (d as f64) * 1.0;

    if chars.len() >= 6 {
        let e = chars[4].to_ascii_lowercase() as i32 - 'a' as i32;
        let f = chars[5].to_ascii_lowercase() as i32 - 'a' as i32;
        if e >= 0 && e < 24 && f >= 0 && f < 24 {
            lon += (e as f64) * (2.0 / 24.0) + (1.0 / 24.0);
            lat += (f as f64) * (1.0 / 24.0) + (0.5 / 24.0);
        } else {
            lon += 1.0;
            lat += 0.5;
        }
    } else {
        lon += 1.0;
        lat += 0.5;
    }

    Some((lat, lon))
}

/// Haversine distance in km between two (lat, lon) points in degrees.
pub fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6371.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();
    r * c
}
