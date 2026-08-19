import { strFromU8, unzipSync } from 'fflate';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry } from '../shared/types';

export interface ParsedGisFile {
  format:'KML'|'KMZ'|'Shapefile ZIP';
  featureCollection:GeoJsonFeatureCollection;
  fields:string[];
  geometryTypes:string[];
  warnings:string[];
}

const supported = new Set(['Point','LineString','MultiLineString','Polygon','MultiPolygon']);

function scalarProperties(input:unknown):Record<string,string|number|boolean|null> {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(Object.entries(input as Record<string,unknown>).slice(0,100).map(([key,value])=>[
    key,
    value === null || ['string','number','boolean'].includes(typeof value) ? value as string|number|boolean|null : JSON.stringify(value).slice(0,1000),
  ]));
}

function normalize(raw:unknown, warnings:string[]):GeoJsonFeatureCollection {
  const collections = Array.isArray(raw) ? raw : [raw];
  const candidates = collections.flatMap((item)=>{
    if (!item || typeof item !== 'object') return [];
    const value = item as {features?:unknown[]};
    return Array.isArray(value.features) ? value.features : [];
  });
  const features:GeoJsonFeature[] = [];
  candidates.forEach((item,index)=>{
    if (!item || typeof item !== 'object') return;
    const feature = item as {id?:string|number;geometry?:{type?:string;coordinates?:unknown};properties?:unknown};
    if (!feature.geometry?.type || !supported.has(feature.geometry.type) || !Array.isArray(feature.geometry.coordinates)) {
      warnings.push(`Feature ${index+1} was skipped because its geometry is empty or unsupported.`);
      return;
    }
    features.push({type:'Feature',id:feature.id===undefined?undefined:String(feature.id),geometry:{type:feature.geometry.type,coordinates:feature.geometry.coordinates} as GeoJsonGeometry,properties:scalarProperties(feature.properties)});
  });
  if (!features.length) throw new Error('No supported Point, LineString or Polygon features were found in this file.');
  return {type:'FeatureCollection',features};
}

export async function parseGisFile(file:File):Promise<ParsedGisFile> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isKml = extension === 'kml';
  if (!['kml','kmz','zip'].includes(extension ?? '')) throw new Error('Choose a .kml, .kmz, or zipped Shapefile (.zip).');
  if ((isKml && file.size > 10*1024*1024) || (!isKml && file.size > 25*1024*1024)) throw new Error('KML files are limited to 10 MB; KMZ and Shapefile ZIP files are limited to 25 MB.');
  const warnings:string[] = [];
  let raw:unknown;
  let format:ParsedGisFile['format'];
  if (isKml) {
    format='KML';
    raw=kml(new DOMParser().parseFromString(await file.text(),'text/xml'));
  } else if (extension === 'kmz') {
    format='KMZ';
    const entries=unzipSync(new Uint8Array(await file.arrayBuffer()));
    const name=Object.keys(entries).find((candidate)=>candidate.toLowerCase().endsWith('.kml'));
    if(!name)throw new Error('This KMZ archive does not contain a KML document.');
    raw=kml(new DOMParser().parseFromString(strFromU8(entries[name]),'text/xml'));
  } else {
    format='Shapefile ZIP';
    raw=await shp(await file.arrayBuffer());
  }
  const featureCollection=normalize(raw,warnings);
  const fields=[...new Set(featureCollection.features.flatMap((feature)=>Object.keys(feature.properties)))].sort();
  const geometryTypes=[...new Set(featureCollection.features.map((feature)=>feature.geometry.type))];
  if (!fields.length) warnings.push('No source attributes were found; deterministic geometry IDs and generated names will be used.');
  return {format,featureCollection,fields,geometryTypes,warnings};
}
