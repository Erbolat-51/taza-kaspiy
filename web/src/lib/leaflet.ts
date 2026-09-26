import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

// Плагины markercluster и heat — UMD и ищут глобальный L. Этот модуль импортируется первым.
(window as unknown as { L: typeof L }).L = L;

export default L;
