// frontend/static/js/map.js
// @FileDescription: 初始化地图


export function initMap() {
    // 初始化时先禁用默认的 zoomControl (因为它默认在左上角)
    // 记得把中心点改为你需要的长沙坐标
    const map = L.map('map', {
        zoomControl: false, // <--- 关键：先关掉默认的
        center: [28.2282, 112.9388],
        zoom: 13
    });
    
    // 手动添加 zoomControl 到 'bottomright' (右下角)
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // 加载 CartoDB 浅色底图
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 20,
        crossOrigin: true
    }).addTo(map);

    // 如果你想使用 OpenStreetMap 的底图，可以取消下面的注释
    // L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    //     maxZoom: 19,
    //     attribution: '© OpenStreetMap'
    // }).addTo(map);

    // 监听鼠标移动，更新左下角坐标
    map.on('mousemove', function(e) {
        const coordsDiv = document.getElementById('mouse-coords');
        if (coordsDiv) {
            // toFixed(5) 保留5位小数，足够精确
            coordsDiv.innerHTML = `Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}`;
        }
    });
    return map;
}