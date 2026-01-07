// =======================================
// 第一阶段 · 第二步
// 公共设施属性规范化与分类显示
// =======================================

//缓冲区图层变量
// =======================================
// 图层全局变量（必须）
// =======================================
let facilityLayer = null;   // 公共设施
let bufferLayer = null;
let residentLayer = null;
let bufferResult = null;   // ⭐ 新增（全局缓冲区结果）
// 当前选中的设施（用于编辑 / 删除）
let selectedFacilityLayer = null;
// 新增设施时的临时状态
let isAddingFacility = false;
let coverageChart = null;




// 1. 初始化地图
const map = L.map('map').setView([28.171, 112.931], 14);

// 2. 加载底图
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);


/**
 * 生成指定范围内的随机整数
 */
function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * 根据居民点类型生成模拟人口
 */
function generatePopulationByType(properties) {

  // 学生宿舍
  if (
    properties.building === 'dormitory' ||
    properties.amenity === 'student_housing'
  ) {
    return randomInt(800, 3000);
  }

  // 普通住宅
  if (
    properties.building &&
    ['residential', 'apartments', 'house'].includes(properties.building)
  ) {
    return randomInt(200, 1200);
  }

  // 社区 / 其他
  return randomInt(500, 2000);
}


// 3. 设施分类映射规则（系统级）
function normalizeFacilityCategory(properties) {

  if (properties.amenity) {
    if (['hospital', 'clinic', 'doctors', 'pharmacy'].includes(properties.amenity))
      return { category: 'medical', rawType: properties.amenity };

    if (['school', 'college', 'university', 'library'].includes(properties.amenity))
      return { category: 'education', rawType: properties.amenity };

    if (['police', 'fire_station', 'townhall'].includes(properties.amenity))
      return { category: 'public', rawType: properties.amenity };

    if (['community_centre', 'social_facility', 'public_building', 'toilets'].includes(properties.amenity))
      return { category: 'community', rawType: properties.amenity };
  }

  if (properties.leisure) {
    if (['park', 'sports_centre', 'pitch'].includes(properties.leisure))
      return { category: 'park', rawType: properties.leisure };
  }

  if (properties.sport) {
    return { category: 'sports', rawType: properties.sport };
  }

  return { category: 'other', rawType: 'unknown' };
}

// =======================================
// 医疗设施缓冲区分析函数（参数化）
// =======================================
function runMedicalBufferAnalysis(normalizedFeatures) {

  // 1. 选取医疗设施
  const medicalFacilities = normalizedFeatures.filter(
    f => f.properties.category === 'medical'
  );

  if (medicalFacilities.length === 0) {
    console.warn('未检测到医疗设施，缓冲区分析未执行');
    return;
  }

  // 2. 读取用户选择的缓冲距离
  const bufferRadius = Number(
    document.getElementById('bufferDistance').value
  );

  // 3. 转为 Turf FeatureCollection
  const medicalFC = turf.featureCollection(
    medicalFacilities.map(f => turf.point(f.geometry.coordinates))
  );

  // 4. 生成缓冲区
  const rawBuffer = turf.buffer(medicalFC, bufferRadius, {
    units: 'meters'
  });

  // 5. 合并多个缓冲面
  bufferResult = rawBuffer.features.reduce((merged, feature) => {
    return merged ? turf.union(merged, feature) : feature;
  }, null);

  // 6. 移除旧缓冲区
  if (bufferLayer) {
    map.removeLayer(bufferLayer);
  }

  // 7. 添加新缓冲区
  bufferLayer = L.geoJSON(rawBuffer, {
    style: {
      color: '#e41a1c',
      fillOpacity: 0.3
    }
  }).addTo(map);

  console.log(`医疗设施 ${bufferRadius} m 缓冲区分析完成`);
}


// 4. 不同类别的显示样式
function getStyleByCategory(category) {
  const styles = {
    medical:   { color: '#d73027' },
    education: { color: '#4575b4' },
    sports:    { color: '#1a9850' },
    park:      { color: '#66bd63' },
    public:    { color: '#984ea3' },
    community: { color: '#ff7f00' },
    other:     { color: '#666666' }
  };

  return styles[category] || styles.other;
}

// 5. 加载并处理设施数据
fetch('data/facilities.geojson')
  .then(res => res.json())
  .then(geojson => {

    console.log('原始设施数量：', geojson.features.length);

    const normalizedFeatures = geojson.features.map((f, index) => {

      const result = normalizeFacilityCategory(f.properties);

      return {
        type: 'Feature',
        properties: {
          id: index + 1,
          name: f.properties.name || '未命名设施',
          category: result.category,
          rawType: result.rawType
        },
        geometry: f.geometry
      };
    });

    // 6. 添加到地图
facilityLayer = L.geoJSON(
  {
    type: 'FeatureCollection',
    features: normalizedFeatures
  },
  {
    pointToLayer: (feature, latlng) => {
      const style = getStyleByCategory(feature.properties.category);
      return L.circleMarker(latlng, {
        radius: 6,
        color: style.color,
        fillOpacity: 0.8
      });
    },
    onEachFeature: (feature, layer) => {

  // 点击选中设施
  layer.on('click', () => {
    selectedFacilityLayer = layer;
  });

  layer.bindPopup(
    `<b>${feature.properties.name}</b><br/>
     分类：${feature.properties.category}<br/>
     原始类型：${feature.properties.rawType}`
  );
}
  }
);

// ⚠️ 注意：这里再 addTo
facilityLayer.addTo(map);
// 初始执行一次医疗设施缓冲区分析
runMedicalBufferAnalysis(normalizedFeatures);



    // 统计并显示分类数量
   const stats = countFacilitiesByCategory(normalizedFeatures);
   renderStatsTable(stats);

    console.log('设施分类统计结果：', stats);

    console.log('设施分类完成并已显示');



  })
  .catch(err => {
    console.error('设施数据处理失败：', err);
  });

  /**
 * 根据设施分类统计数量
 */
function countFacilitiesByCategory(features) {
  const stats = {};

  features.forEach(f => {
    const cat = f.properties.category;
    stats[cat] = (stats[cat] || 0) + 1;
  });

  return stats;
}

/**
 * 将统计结果显示到表格中
 */
function renderStatsTable(stats) {
  const tbody = document.querySelector('#statsTable tbody');
  tbody.innerHTML = '';

  Object.keys(stats).forEach(cat => {
    const tr = document.createElement('tr');

    const tdType = document.createElement('td');
    tdType.textContent = cat;

    const tdCount = document.createElement('td');
    tdCount.textContent = stats[cat];

    tr.appendChild(tdType);
    tr.appendChild(tdCount);
    tbody.appendChild(tr);
  });
}

// ================================
// 第二阶段 · 第二步
// 居民点覆盖判断与人口统计
// ================================
// ================================
// 第二阶段 · 第二步
// 居民点覆盖判断 + 盲区可视化
// ================================

fetch('data/residents.geojson')
  .then(res => res.json())
  .then(residentGeoJSON => {

    // =================================
    // 1️⃣ 注入模拟人口（保留你的逻辑）
    // =================================
    residentGeoJSON.features.forEach(feature => {
      feature.properties.population =
        generatePopulationByType(feature.properties);
    });

    // =================================
    // 2️⃣ 覆盖统计变量
    // =================================
    let coveredPopulation = 0;
    let coveredResidentsCount = 0;
    let uncoveredResidentsCount = 0;

    // =================================
    // 3️⃣ 构建居民点图层（关键）
    // =================================
    residentLayer = L.geoJSON(residentGeoJSON, {
      pointToLayer: (feature, latlng) => {

        // Turf 点
        const point = turf.point(feature.geometry.coordinates);

        // 是否被医疗服务区覆盖
        const isCovered = bufferResult
          ? turf.booleanPointInPolygon(point, bufferResult)
          : false;

        // 统计
        if (isCovered) {
          coveredResidentsCount++;
          coveredPopulation += feature.properties.population;
        } else {
          uncoveredResidentsCount++;
        }

        // 不同状态 → 不同颜色
        return L.circleMarker(latlng, {
          radius: 5,
          color: isCovered ? '#1a9850' : '#d73027', // 绿 / 红
          fillOpacity: 0.8
        });
      },

      onEachFeature: (feature, layer) => {
        layer.bindPopup(`
          <b>居民点</b><br/>
          人口：${feature.properties.population}
        `);
      }
    });

    // =================================
    // 4️⃣ 添加到地图
    // =================================
    residentLayer.addTo(map);

    // =================================
    // 5️⃣ 输出分析结果（阶段验收）
    // =================================
    console.log('覆盖居民点数量：', coveredResidentsCount);
    console.log('未覆盖居民点数量：', uncoveredResidentsCount);
    console.log('覆盖人口总数：', coveredPopulation);

        // ================================
// Step 5：结果输出到页面
// ================================
document.getElementById('coveredCount').textContent =
  coveredResidentsCount;

document.getElementById('uncoveredCount').textContent =
  uncoveredResidentsCount;

document.getElementById('coveredPopulation').textContent =
  coveredPopulation;

  
updateCoverageChart(coveredResidentsCount, uncoveredResidentsCount);

  })
  .catch(err => {
    console.error('居民点数据加载失败：', err);
  });

  // =======================================
// 图层管理：checkbox 绑定逻辑
// 放在 main.js 最底部
// =======================================

document.getElementById('chkFacility').addEventListener('change', e => {
  if (!facilityLayer) return;
  if (e.target.checked) {
    facilityLayer.addTo(map);
  } else {
    map.removeLayer(facilityLayer);
  }
});

document.getElementById('chkBuffer').addEventListener('change', e => {
  if (!bufferLayer) return;
  if (e.target.checked) {
    bufferLayer.addTo(map);
  } else {
    map.removeLayer(bufferLayer);
  }
});

document.getElementById('chkResident').addEventListener('change', e => {
  if (!residentLayer) return;
  if (e.target.checked) {
    residentLayer.addTo(map);
  } else {
    map.removeLayer(residentLayer);
  }
});

// =======================================
// 缓冲区分析按钮绑定
// =======================================
document.getElementById('btnRunBuffer').addEventListener('click', () => {

  if (!facilityLayer) {
    console.warn('设施图层未加载，无法分析');
    return;
  }

  // 重新执行缓冲区分析
  runMedicalBufferAnalysis(
    facilityLayer.toGeoJSON().features
  );

  // ⚠️ 重新计算居民点覆盖（后续 Step 4 会优化）
  if (residentLayer) {
    map.removeLayer(residentLayer);
    residentLayer = null;
  }

  console.log('已重新执行缓冲区分析，请刷新居民点覆盖结果');
});

// =======================================
// 新增设施
// =======================================
document.getElementById('btnAddFacility').addEventListener('click', () => {
  isAddingFacility = true;
  alert('请在地图上点击一个位置以新增设施');
});

map.on('click', e => {

  if (!isAddingFacility) return;

  const name = prompt('请输入设施名称：');
  if (!name) {
    isAddingFacility = false;
    return;
  }

  const category = prompt(
    '请输入设施类型（medical / education / park / sports / public / community）：',
    'medical'
  );

  const newFeature = {
    type: 'Feature',
    properties: {
      name: name,
      category: category || 'other',
      rawType: 'user_added'
    },
    geometry: {
      type: 'Point',
      coordinates: [e.latlng.lng, e.latlng.lat]
    }
  };

  // 添加到设施图层
  const newLayer = L.geoJSON(newFeature, {
    pointToLayer: (feature, latlng) => {
      const style = getStyleByCategory(feature.properties.category);
      return L.circleMarker(latlng, {
        radius: 6,
        color: style.color,
        fillOpacity: 0.8
      });
    },
    onEachFeature: (feature, layer) => {

      layer.on('click', () => {
        selectedFacilityLayer = layer;
      });

      layer.bindPopup(
        `<b>${feature.properties.name}</b><br/>
         分类：${feature.properties.category}`
      );
    }
  });

  newLayer.addTo(facilityLayer);

  isAddingFacility = false;
});


// =======================================
// 编辑设施
// =======================================
document.getElementById('btnEditFacility').addEventListener('click', () => {

  if (!selectedFacilityLayer) {
    alert('请先点击一个设施点');
    return;
  }

  const feature = selectedFacilityLayer.feature;

  const newName = prompt('修改设施名称：', feature.properties.name);
  if (!newName) return;

  feature.properties.name = newName;

  selectedFacilityLayer.setPopupContent(
    `<b>${feature.properties.name}</b><br/>
     分类：${feature.properties.category}<br/>
     原始类型：${feature.properties.rawType}`
  );

  alert('设施信息已更新');
});

// =======================================
// 删除设施
// =======================================
document.getElementById('btnDeleteFacility').addEventListener('click', () => {

  if (!selectedFacilityLayer) {
    alert('请先点击一个设施点');
    return;
  }

  const confirmDelete = confirm('确认删除该设施？');
  if (!confirmDelete) return;

  facilityLayer.removeLayer(selectedFacilityLayer);
  selectedFacilityLayer = null;

  alert('设施已删除');
});

function updateCoverageChart(coveredCount, uncoveredCount) {
  const ctx = document
    .getElementById('coverageChart')
    .getContext('2d');

  // 第一次创建
  if (!coverageChart) {
    coverageChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['已覆盖居民点', '服务盲区居民点'],
        datasets: [{
          data: [coveredCount, uncoveredCount],
          backgroundColor: ['#1a9641', '#d7191c']
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  } else {
    // 后续更新
    coverageChart.data.datasets[0].data = [
      coveredCount,
      uncoveredCount
    ];
    coverageChart.update();
  }
}
