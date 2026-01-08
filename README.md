
# 城市公共设施服务覆盖分析系统 (Urban Public Facilities Service Coverage Analysis System)

![Project Status](https://img.shields.io/badge/Status-Completed-success)
![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-green)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-orange)

> 基于 WebGIS 技术的城市公共服务设施布局评价与可视化分析工具。

## 📖 项目简介

本项目是一个 B/S 架构的 WebGIS 系统，旨在辅助规划部门及研究人员评估城市公共服务设施（教育、医疗、文娱、商业等）的空间分布及其服务覆盖情况。系统支持多源数据导入、基于路网的服务区分析、覆盖盲区计算以及居民点服务完善度评价，并提供图表与地图的导出功能。

## ✨ 核心功能

### 1. 数据管理与可视化
*   **多源数据加载**：支持 POI（设施点）、路网、居民点、建筑物的 GeoJSON 数据展示。
*   **分级分类显示**：
    *   POI：支持按“教育、医疗、文娱、商业、其他”五大类筛选显示。
    *   路网：支持按“高速、快速路、主干道、次干道、居民道、其他”六级显示不同颜色与粗细。
*   **交互式编辑**：
    *   支持在线**新增、修改、删除**点/线/面要素。
    *   支持**查看与编辑**要素的所有属性字段（自动排序，重要字段置顶）。
    *   支持**几何形状重绘**。
*   **自定义数据导入**：用户可上传自己的 GeoJSON 数据集覆盖默认示例数据，并支持一键恢复。

### 2. 高级空间分析
*   **服务区分析 (Service Area)**：
    *   支持按类型筛选或**手动框选**特定 POI。
    *   基于路网几何进行缓冲区模拟，生成沿路网分布的服务范围面（非简单圆）。
    *   自动统计服务区覆盖的建筑物数量及面积。
*   **覆盖盲区分析 (Blind Spot)**：
    *   支持用户手绘任意多边形作为分析区域。
    *   自动计算分析区域与服务区的**几何差集**，高亮显示服务盲区。
*   **居民点完善度评价**：
    *   支持点击任意居民点，分析其指定半径（如 1000米）内的设施配套情况。
    *   自动判断缺失的设施类型（如“缺医疗”）。

### 3. 结果输出与统计
*   **统计图表**：
    *   集成 **ECharts**，支持生成 POI 数量占比饼图。
    *   支持批量计算所有居民点的服务完善度，生成堆叠柱状图（完善 vs 缺失）。
    *   支持图表数据导出为 **CSV** 表格。
*   **地图导出**：
    *   集成 `dom-to-image`，支持将当前地图视图（含分析结果）一键导出为 **PNG** 图片。

## 🛠️ 技术栈

### 1. 前端 (Frontend)
*   **Core**: HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
*   **Map Engine**: [Leaflet.js](https://leafletjs.com/)
*   **Spatial Analysis**: [Turf.js](https://turfjs.org/) (客户端轻量计算)
*   **Visualization**: [ECharts](https://echarts.apache.org/) (统计图表)
*   **Plugins**: Leaflet.Draw (绘图), dom-to-image (截图)
*   **Style**: CSS3 Flexbox/Grid, Glassmorphism (磨砂玻璃风格)

### 2. 后端 (Backend)
*   **Framework**: Python [Flask](https://flask.palletsprojects.com/)
*   **Geometry Engine**: [Shapely](https://shapely.readthedocs.io/) (处理复杂的几何交集与面积计算)
*   **Data Format**: GeoJSON

## 🚀 快速开始

### 1. 环境准备
确保本地已安装 Python 3.8+。

### 2. 克隆项目
```bash
git clone <你的仓库地址>
cd WebGIS04_PublicFacilitiesService
```

### 3. 安装依赖
建议创建虚拟环境以保持环境纯净。
```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Mac/Linux
python3 -m venv venv
source venv/bin/activate

# 安装依赖包
pip install -r requirements.txt
```

### 4. 启动服务
```bash
python backend/app.py
```
终端显示 Running on `http://127.0.0.1:5000` 即表示启动成功。

### 5. 访问系统
打开浏览器（推荐 Chrome 或 Edge）访问：http://127.0.0.1:5000
📂 项目目录结构
```text
WebGIS04_PublicFacilitiesService/
├── backend/
│   ├── app.py                # Flask 后端入口与 API 逻辑
│   ├── requirements.txt      # Python 依赖清单
│   └── venv/                 # 虚拟环境 (不提交)
├── data/                     # 存放 GeoJSON 数据源与配置文件
│   ├── classification.txt    # 设施类型映射配置
│   └── *.geojson             # 新增示例数据 (不提交)
├── frontend/
│   ├── static/
│   │   ├── css/              # 样式文件
│   │   ├── js/
│   │   │   ├── modules/      # JS 代码 (API, 分析, 编辑器等)
│   │   │   ├── main.js       # 前端入口
│   │   │   └── map.js        # 地图配置
│   │   └── lib               # 离线库 (没用上，不提交)
│   └── templates/
│       └── index.html        # 主页结构
└── README.md                 # 项目说明文档
```

## 📝 操作指南

### 1. 数据管理
在左侧面板勾选不同类型的 POI 或路网进行加载。点击列表中的行可高亮地图点（支持 Shift/Ctrl 多选）。

### 2. 空间分析
*   切换到“空间分析”标签页。
*   点击“框选 POI”选择分析对象，输入距离阈值，点击“开始路网分析”。
*   分析完成后，点击“绘制区域并分析盲区”进行盲区识别。

### 3. 编辑数据
点击地图右上角的 + (新增) 或 ✎ (修改) 按钮，对地图要素进行编辑。

### 4. 导出结果
切换到“结果输出”标签页，可导出高清地图截图或统计报表。