/**
 * Geocoding Utility using OpenStreetMap Nominatim
 * Free, no-key retrieval of coordinates from address strings.
 */

export interface Coordinates {
  lat: number;
  lng: number;
  isApproximate?: boolean;
}

export async function getCoordinates(address: string): Promise<Coordinates | null> {
  if (!address || address.length < 3) return null;

  try {
    // 1. Primary Attempt: Full Address
    const primaryUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    
    let response = await fetch(primaryUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MediRoute-AI-Triage-System'
      }
    });
    
    let data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        isApproximate: false
      };
    }

    // 2. Fallback Attempt: Approximate (Try just the last parts of the address)
    // Extract everything after the last comma or just the last 2 words (usually city/state)
    const parts = address.split(',').map(p => p.trim());
    if (parts.length > 1) {
      const approximateAddress = parts.slice(-2).join(', ');
      console.log(`DEBUG: Geocoding primary failed. Trying approximate: ${approximateAddress}`);
      
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(approximateAddress)}&limit=1`;
      response = await fetch(fallbackUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MediRoute-AI-Triage-System'
        }
      });
      data = await response.json();

      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          isApproximate: true
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Geocoding failed:', error);
    return null;
  }
}
