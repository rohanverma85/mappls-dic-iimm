import { api } from './api';

export interface LocatedPoint {
  lat: number;
  lng: number;
  accuracyMeters: number;
  source: 'Device GPS' | 'Map selection' | 'Demo location';
  address: string;
  addressSource: string;
}

export function coordinateLabel(point:{lat:number;lng:number}) {
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}

export async function reverseGeocode(point:{lat:number;lng:number}) {
  const result = await api<{address:string;source:string;configured:boolean}>(`/api/mappls/reverse-geocode?lat=${point.lat}&lng=${point.lng}`);
  return { address:result.address || coordinateLabel(point), addressSource:result.source || 'Mappls' };
}

export async function enrichLocation<T extends {lat:number;lng:number}>(point:T) {
  try {
    return { ...point, ...await reverseGeocode(point) };
  } catch (error) {
    return {
      ...point,
      address:coordinateLabel(point),
      addressSource:error instanceof Error ? `Address unavailable: ${error.message}` : 'Address unavailable',
    };
  }
}

export function captureDeviceLocation(fallback:LocatedPoint) {
  return new Promise<LocatedPoint>((resolve) => {
    if (!navigator.geolocation) return resolve(fallback);
    navigator.geolocation.getCurrentPosition(
      async (position)=>resolve(await enrichLocation({
        lat:position.coords.latitude,
        lng:position.coords.longitude,
        accuracyMeters:Math.round(position.coords.accuracy),
        source:'Device GPS' as const,
      })),
      ()=>resolve(fallback),
      {enableHighAccuracy:true,timeout:12_000,maximumAge:15_000},
    );
  });
}
