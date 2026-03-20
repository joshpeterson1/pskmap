use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSpot {
    pub source: String,
    pub callsign: String,
    pub frequency: Option<f64>,
    pub mode: Option<String>,
    pub reference: Option<String>,
    pub reference_name: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub grid: Option<String>,
    pub timestamp: Option<i64>,
    pub spotter: Option<String>,
    pub comments: Option<String>,
}
