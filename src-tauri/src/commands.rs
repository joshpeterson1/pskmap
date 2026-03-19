use crate::models::SpotQuery;
use crate::pskreporter;

#[tauri::command]
pub async fn fetch_spots(query: SpotQuery) -> Result<Vec<crate::models::Spot>, String> {
    println!("[PSKmap] fetch_spots called: {:?}", query);
    match pskreporter::fetch_spots(&query).await {
        Ok(spots) => {
            println!("[PSKmap] Got {} spots", spots.len());
            Ok(spots)
        }
        Err(e) => {
            println!("[PSKmap] Error: {}", e);
            Err(e)
        }
    }
}
