import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { MapContainer, Marker, Popup, TileLayer, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinned, Loader2, Navigation2, Phone, LocateFixed, ListChecks } from 'lucide-react';
import LayoutSidebar from '../components/LayoutSidebar';
import { useProfile } from '../hooks/useProfile';

type TriageContext = {
  session_id: string;
  recommended_specialist: string;
  urgency: string;
  chief_complaint: string;
};

type NearbyFacility = {
  id: string;
  name: string;
  address: string;
  contact_number: string;
  latitude: number | null;
  longitude: number | null;
  facility_type: string;
  specialty_match: boolean;
  matched_departments: string[];
  all_departments: string[];
  distance_km: number | null;
  distance_note: string;
};

type UserCoords = {
  lat: number;
  lng: number;
};

const API = 'http://127.0.0.1:8002';
const DEFAULT_CENTER: [number, number] = [3.139, 101.6869];

const FallbackIcons = {
  user: L.divIcon({
    className: '',
    html: '<div style="width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,#1E88E5,#0D47A1);border:3px solid white;box-shadow:0 8px 18px rgba(13,71,161,0.35);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  }),
  facility: L.divIcon({
    className: '',
    html: '<div style="width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,#2E7D32,#66BB6A);border:3px solid white;box-shadow:0 8px 18px rgba(46,125,50,0.30);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  }),
};

function resolveFallbackCoords(location: string | null | undefined): UserCoords | null {
  const value = (location || '').toLowerCase();
  if (!value) return null;

  const knownLocations: Array<{ match: string[]; coords: UserCoords }> = [
    { match: ['miri'], coords: { lat: 4.3995, lng: 113.9914 } },
    { match: ['kuala lumpur', 'kl'], coords: { lat: 3.139, lng: 101.6869 } },
    { match: ['petaling jaya', 'pj'], coords: { lat: 3.1073, lng: 101.6067 } },
    { match: ['cyberjaya'], coords: { lat: 2.9213, lng: 101.6511 } },
  ];

  const match = knownLocations.find((entry) => entry.match.some((fragment) => value.includes(fragment)));
  return match?.coords || null;
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm == null) return 'Distance unavailable';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
  return `${distanceKm.toFixed(1)} km away`;
}

function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
}

export default function NearbyFacilities() {
  const { getToken } = useAuth();
  const { profile } = useProfile();

  const [triageContext, setTriageContext] = useState<TriageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [loadingFacilities, setLoadingFacilities] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [facilities, setFacilities] = useState<NearbyFacility[]>([]);

  useEffect(() => {
    const cached = sessionStorage.getItem('latestTriageContext');
    if (cached) {
      try {
        setTriageContext(JSON.parse(cached));
      } catch {
        sessionStorage.removeItem('latestTriageContext');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyCoords = async () => {
      setLoadingGeo(true);
      setGeoError(null);

      const loadFacilities = async (coords: UserCoords | null) => {
        try {
          setLoadingFacilities(true);
          const token = await getToken();
          const res = await fetch(`${API}/api/hospitals/nearby`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              latitude: coords?.lat ?? null,
              longitude: coords?.lng ?? null,
              location: profile?.location || '',
              specialist: triageContext?.recommended_specialist || '',
              limit: 12,
            }),
          });

          if (!res.ok) {
            let detail = 'Unable to load nearby healthcare facilities.';
            try {
              const err = await res.json();
              detail = err?.detail || detail;
            } catch {
              // keep default
            }
            throw new Error(detail);
          }

          const data = await res.json();
          if (!cancelled) {
            setFacilities(data?.facilities || []);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Unable to load nearby facilities.');
          }
        } finally {
          if (!cancelled) {
            setLoadingFacilities(false);
          }
        }
      };

      const fallback = resolveFallbackCoords(profile?.location);
      const useFallback = async () => {
        if (fallback) {
          setUserCoords(fallback);
          await loadFacilities(fallback);
        } else {
          await loadFacilities(null);
        }
      };

      if (!navigator.geolocation) {
        setGeoError('Geolocation is not available in this browser.');
        await useFallback();
        setLoadingGeo(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled) return;
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserCoords(coords);
          await loadFacilities(coords);
          setLoadingGeo(false);
        },
        async (err) => {
          if (cancelled) return;
          setGeoError(err.message || 'Location permission was denied.');
          await useFallback();
          setLoadingGeo(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    };

    applyCoords();

    return () => {
      cancelled = true;
    };
  }, [getToken, profile?.location, triageContext?.recommended_specialist]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (userCoords) return [userCoords.lat, userCoords.lng];
    const firstFacility = facilities.find((facility) => facility.latitude != null && facility.longitude != null);
    if (firstFacility && firstFacility.latitude != null && firstFacility.longitude != null) {
      return [firstFacility.latitude, firstFacility.longitude];
    }
    return DEFAULT_CENTER;
  }, [facilities, userCoords]);

  return (
    <LayoutSidebar>
      <div className="responsive-padding" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '0.35rem' }}>Nearby Healthcare Facilities</h1>
            <p style={{ color: 'var(--text-muted)', maxWidth: '760px' }}>
              Hospitals and clinics near your current location. This is a read-only map for now.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {triageContext ? (
              <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#1b5e20', borderRadius: '12px', padding: '0.65rem 0.9rem', fontWeight: 700 }}>
                Booking filtered by {triageContext.recommended_specialist}
              </div>
            ) : (
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', color: '#8a6d00', borderRadius: '12px', padding: '0.65rem 0.9rem', fontWeight: 700 }}>
                Complete intake first to unlock specialty-based booking
              </div>
            )}
          </div>
        </div>

        {(error || geoError) && (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {geoError && (
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '0.85rem 1rem', color: '#8a6d00' }}>
                {geoError} Showing the closest available fallback area instead.
              </div>
            )}
            {error && (
              <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '10px', padding: '0.85rem 1rem', color: '#b71c1c' }}>
                {error}
              </div>
            )}
          </div>
        )}

        <div className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontWeight: 800 }}>
              <MapPinned size={18} color="var(--primary)" /> Map of Nearby Facilities
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <LocateFixed size={15} /> Live location permission + selected healthcare facilities
            </div>
          </div>

          <div className="facility-map">
            <MapContainer
              center={mapCenter}
              zoom={13}
              scrollWheelZoom={false}
              dragging={false}
              doubleClickZoom={false}
              touchZoom={false}
              boxZoom={false}
              keyboard={false}
              zoomControl={false}
              style={{ height: '100%', width: '100%' }}
            >
              <MapCenter center={mapCenter} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {userCoords && (
                <>
                  <Marker position={[userCoords.lat, userCoords.lng]} icon={FallbackIcons.user}>
                    <Popup>
                      <strong>Your location</strong>
                      <div style={{ marginTop: '0.25rem' }}>This is the point used to find nearby facilities.</div>
                    </Popup>
                  </Marker>
                  <Circle center={[userCoords.lat, userCoords.lng]} radius={600} pathOptions={{ color: '#1E88E5', fillColor: '#1E88E5', fillOpacity: 0.08 }} />
                </>
              )}

              {facilities
                .filter((facility) => facility.latitude != null && facility.longitude != null)
                .map((facility) => (
                  <Marker
                    key={facility.id}
                    position={[facility.latitude as number, facility.longitude as number]}
                    icon={FallbackIcons.facility}
                  >
                    <Popup>
                      <div style={{ display: 'grid', gap: '0.4rem', minWidth: '220px' }}>
                        <div style={{ fontWeight: 800 }}>{facility.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{facility.address}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDistance(facility.distance_km)}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <ListChecks size={17} color="var(--primary)" /> Nearby Facilities List
              </div>
              {(loadingGeo || loadingFacilities) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <Loader2 size={15} className="animate-spin" /> Locating nearby facilities...
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
                <Loader2 size={16} className="animate-spin" /> Preparing facility map...
              </div>
            ) : facilities.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No healthcare facilities were found nearby.</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {facilities.map((facility) => {
                  return (
                    <div
                      key={facility.id}
                      style={{
                        border: '1px solid var(--neutral-400)',
                        background: 'white',
                        borderRadius: '14px',
                        padding: '1rem',
                        display: 'grid',
                        gap: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div className="facility-row-main">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{facility.name}</div>
                            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.2rem 0.45rem', borderRadius: '999px', background: 'var(--neutral-200)', color: 'var(--text-muted)' }}>
                              {facility.facility_type}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{facility.address}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                            <Navigation2 size={14} /> {facility.distance_note}
                            {facility.contact_number && (
                              <>
                                <span>•</span>
                                <Phone size={14} /> {facility.contact_number}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="facility-row-side">
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {facility.specialty_match ? 'Matches booking filter' : 'Available for general browsing'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        {facility.matched_departments.slice(0, 4).map((dept) => (
                          <span key={dept} style={{ background: '#e8f5e9', color: '#1b5e20', padding: '0.25rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem' }}>
                            {dept}
                          </span>
                        ))}
                        {!facility.matched_departments.length && facility.all_departments.slice(0, 4).map((dept) => (
                          <span key={dept} style={{ background: 'var(--neutral-200)', color: 'var(--text-muted)', padding: '0.25rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem' }}>
                            {dept}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </LayoutSidebar>
  );
}
