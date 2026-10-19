// Фабрика материалов с учётом качества: PBR (Standard) или упрощённый Lambert.
import * as THREE from 'three';
import { settings } from './settings.js';

export function mat(p = {}) {
  const { metalness = 0, roughness = 0.6, emissive, emissiveIntensity = 1, ...rest } = p;
  const em = emissive !== undefined ? { emissive, emissiveIntensity } : {};
  if (settings.materials === 'pbr') {
    return new THREE.MeshStandardMaterial({ metalness, roughness, envMapIntensity: 0.5, ...em, ...rest });
  }
  const m = new THREE.MeshLambertMaterial({ ...em, ...rest });
  // у металла без env-карты слишком тёмный вид — чуть подсветим
  if (metalness > 0.5 && m.color) m.color.multiplyScalar(1.15);
  return m;
}

export function glow(color, k = 1.6, extra = {}) {
  const c = new THREE.Color(color).multiplyScalar(k);
  return new THREE.MeshBasicMaterial({ color: c, ...extra });
}
