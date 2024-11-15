import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import glow from '/glow.png';
import earth from '/earth.jpg';
import light from '/light.png';


const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const earthGroup = new THREE.Group();
scene.add(earthGroup);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;

// create the earth
const loader = new THREE.TextureLoader();
const geometry = new THREE.IcosahedronGeometry(1, 12);
const material = new THREE.MeshPhongMaterial({
  map: loader.load(earth),
  depthWrite: true,
});
const earthMesh = new THREE.Mesh(geometry, material);
earthGroup.add(earthMesh);

// add light
const ambientLight = new THREE.AmbientLight(0xffffff, 2);
scene.add(ambientLight);

// add glow to the earth
const glowMaterial = new THREE.SpriteMaterial({
  map: loader.load(glow),
  color: 0x4390d1,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});

const glowSprite = new THREE.Sprite(glowMaterial);
glowSprite.scale.set(2.5, 2.5, 1);

glowMaterial.depthTest = false;
glowSprite.renderOrder = 1; // render glow after earth

earthGroup.add(glowSprite);

/**
 * convert the longitude and latitude to the 3D coordinate
 * @param {*} radius radius of the sphere
 * @param {*} longitude longitude represented in degrees
 * @param {*} latitude latitude represented in degrees
 * @returns x, y, z coordinates
 */
export const lon2xyz = (radius, longitude, latitude) => {
  const lonRad = longitude * Math.PI / 180;
  const latRad = latitude * Math.PI / 180;

  const x = -radius * Math.cos(lonRad) * Math.cos(latRad);
  const y = radius * Math.sin(lonRad);
  const z = radius * Math.cos(lonRad) * Math.sin(latRad);
  return { x, y, z };
};

// create a light pillar
export const createLightPillar = (options) => {
  const height = options.radius * 0.3;
  const geometry = new THREE.PlaneGeometry(options.radius * 0.05, height);
  geometry.rotateX(Math.PI / 2);  // rotate to make it vertical
  geometry.translate(0, 0, height / 2);  // relocate to the surface of the sphere

  const material = new THREE.MeshBasicMaterial({
    map: loader.load(light),
    color: options.color,  // color of the light pillar
    transparent: true,
    side: THREE.DoubleSide, 
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();

  // render two light pillars to make it more bright
  group.add(mesh, mesh.clone().rotateZ(Math.PI / 2));

  const SphereCoord = lon2xyz(options.radius, options.lon, options.lat);
  console.log(SphereCoord);
  group.position.set(SphereCoord.x, SphereCoord.y, SphereCoord.z); 

  // calculate the normal vector of the light pillar
  const coordVec3 = new THREE.Vector3(SphereCoord.x, SphereCoord.y, SphereCoord.z).normalize();  // normalize the direction
  const meshNormal = new THREE.Vector3(0, 0, 1);  // target to the z-axis initially

  // rotate the light pillar to the normal direction
  group.quaternion.setFromUnitVectors(meshNormal, coordVec3);

  return group;
};

const sites = [
  { lon: 39, lat: 116, color: 0xffffff }, // Beijing
  { lon: 34.052235, lat: -118.243683, color: 0x00ffff }, // los angeles
]

sites.forEach(site => {
  const lightPillar = createLightPillar({
    radius: 1,
    lon: site.lon,
    lat: site.lat,
    color: site.color,
  });
  earthGroup.add(lightPillar);
});

/**输入地球上任意两点的经纬度坐标，通过函数flyArc可以绘制一个飞线圆弧轨迹
 * lon1,lat1:轨迹线起点经纬度坐标
 * lon2,lat2：轨迹线结束点经纬度坐标
 */
function flyArc(radius, lon1, lat1, lon2, lat2,options) {
  const sphereCoord1 = lon2xyz(radius, lon1, lat1); //经纬度坐标转球面坐标
  // startSphereCoord：轨迹线起点球面坐标
  const startSphereCoord = new THREE.Vector3(sphereCoord1.x, sphereCoord1.y, sphereCoord1.z);
  const sphereCoord2 = lon2xyz(radius, lon2, lat2);
  // startSphereCoord：轨迹线结束点球面坐标
  const endSphereCoord = new THREE.Vector3(sphereCoord2.x, sphereCoord2.y, sphereCoord2.z);

  //计算绘制圆弧需要的关于y轴对称的起点、结束点和旋转四元数
  const startEndQua = _3Dto2D(startSphereCoord, endSphereCoord)
  console.log(startEndQua);
  // 调用arcXOY函数绘制一条圆弧飞线轨迹
  const arcline = arcXOY(radius, startEndQua.startPoint, startEndQua.endPoint,options);
  arcline.quaternion.multiply(startEndQua.quaternion)
  return arcline;
}
/*
* 把3D球面上任意的两个飞线起点和结束点绕球心旋转到到XOY平面上，
* 同时保持关于y轴对称，借助旋转得到的新起点和新结束点绘制
* 一个圆弧，最后把绘制的圆弧反向旋转到原来的起点和结束点即可
*/
function _3Dto2D(startSphere, endSphere) {
  /*计算第一次旋转的四元数：表示从一个平面如何旋转到另一个平面*/
  const origin = new THREE.Vector3(0, 0, 0); //球心坐标
  const startDir = startSphere.clone().sub(origin); //飞线起点与球心构成方向向量
  const endDir = endSphere.clone().sub(origin); //飞线结束点与球心构成方向向量
  // dir1和dir2构成一个三角形，.cross()叉乘计算该三角形法线normal
  const normal = startDir.clone().cross(endDir).normalize();
  const xoyNormal = new THREE.Vector3(0, 0, 1); //XOY平面的法线
  //.setFromUnitVectors()计算从normal向量旋转达到xoyNormal向量所需要的四元数
  // quaternion表示把球面飞线旋转到XOY平面上需要的四元数
  const quaternion3D_XOY = new THREE.Quaternion().setFromUnitVectors(normal, xoyNormal);
  /*第一次旋转：飞线起点、结束点从3D空间第一次旋转到XOY平面*/
  const startSphereXOY = startSphere.clone().applyQuaternion(quaternion3D_XOY);
  const endSphereXOY = endSphere.clone().applyQuaternion(quaternion3D_XOY);

  /*计算第二次旋转的四元数*/
  // middleV3：startSphereXOY和endSphereXOY的中点
  const middleV3 = startSphereXOY.clone().add(endSphereXOY).multiplyScalar(0.5);
  const midDir = middleV3.clone().sub(origin).normalize(); // 旋转前向量midDir，中点middleV3和球心构成的方向向量
  const yDir = new THREE.Vector3(0, 1, 0); // 旋转后向量yDir，即y轴
  // .setFromUnitVectors()计算从midDir向量旋转达到yDir向量所需要的四元数
  // quaternion2表示让第一次旋转到XOY平面的起点和结束点关于y轴对称需要的四元数
  const quaternionXOY_Y = new THREE.Quaternion().setFromUnitVectors(midDir, yDir);

  /*第二次旋转：使旋转到XOY平面的点再次旋转，实现关于Y轴对称*/
  const startSpherXOY_Y = startSphereXOY.clone().applyQuaternion(quaternionXOY_Y);
  const endSphereXOY_Y = endSphereXOY.clone().applyQuaternion(quaternionXOY_Y);

  /**一个四元数表示一个旋转过程
   *.invert()方法表示四元数的逆，简单说就是把旋转过程倒过来
   * 两次旋转的四元数执行.invert()求逆，然后执行.multiply()相乘
   *新版本.invert()对应旧版本.invert()
   */
  const quaternionInverse = quaternion3D_XOY.clone().invert().multiply(quaternionXOY_Y.clone().invert())
  return {
    // 返回两次旋转四元数的逆四元数
    quaternion: quaternionInverse,
    // 范围两次旋转后在XOY平面上关于y轴对称的圆弧起点和结束点坐标
    startPoint: startSpherXOY_Y,
    endPoint: endSphereXOY_Y,
  }
}
/**通过函数arcXOY()可以在XOY平面上绘制一个关于y轴对称的圆弧曲线
 * startPoint, endPoint：表示圆弧曲线的起点和结束点坐标值，起点和结束点关于y轴对称
 * 同时在圆弧轨迹的基础上绘制一段飞线*/
function arcXOY(radius,startPoint, endPoint,options) {
  // 计算两点的中点
  const middleV3 = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
  // 弦垂线的方向dir(弦的中点和圆心构成的向量)
  const dir = middleV3.clone().normalize()
  // 计算球面飞线的起点、结束点和球心构成夹角的弧度值
  const earthRadianAngle = radianAOB(startPoint, endPoint, new THREE.Vector3(0, 0, 0))
  /*设置飞线轨迹圆弧的中间点坐标
  弧度值 * radius * 0.2：表示飞线轨迹圆弧顶部距离地球球面的距离
  起点、结束点相聚越远，构成的弧线顶部距离球面越高*/
  const arcTopCoord = dir.multiplyScalar(radius + earthRadianAngle * radius * 0.15) // 黄色飞行线的高度
  //求三个点的外接圆圆心(飞线圆弧轨迹的圆心坐标)
  const flyArcCenter = threePointCenter(startPoint, endPoint, arcTopCoord)
  // 飞线圆弧轨迹半径flyArcR
  const flyArcR = Math.abs(flyArcCenter.y - arcTopCoord.y);
  /*坐标原点和飞线起点构成直线和y轴负半轴夹角弧度值
  参数分别是：飞线圆弧起点、y轴负半轴上一点、飞线圆弧圆心*/
  const flyRadianAngle = radianAOB(startPoint, new THREE.Vector3(0, -1, 0), flyArcCenter);
  const startAngle = -Math.PI / 2 + flyRadianAngle; //飞线圆弧开始角度
  const endAngle = Math.PI - startAngle; //飞线圆弧结束角度
  console.log(startAngle, endAngle);
  // 调用圆弧线模型的绘制函数
  const arcline = circleLine(flyArcCenter.x, flyArcCenter.y, flyArcR, startAngle, endAngle, options.color)
  // const arcline = new  Group();// 不绘制轨迹线，使用 Group替换circleLine()即可
  arcline.center = flyArcCenter; //飞线圆弧自定一个属性表示飞线圆弧的圆心
  arcline.topCoord = arcTopCoord; //飞线圆弧自定一个属性表示飞线圆弧中间也就是顶部坐标

  return arcline
}
/*计算球面上两点和球心构成夹角的弧度值
参数point1, point2:表示地球球面上两点坐标Vector3
计算A、B两点和顶点O构成的AOB夹角弧度值*/
function radianAOB(A, B, O) {
  // dir1、dir2：球面上两个点和球心构成的方向向量
  const dir1 = A.clone().sub(O).normalize();
  const dir2 = B.clone().sub(O).normalize();
  //点乘.dot()计算夹角余弦值
  const cosAngle = dir1.clone().dot(dir2);
  const radianAngle = Math.acos(cosAngle); //余弦值转夹角弧度值,通过余弦值可以计算夹角范围是0~180度
  return radianAngle
}
/*绘制一条圆弧曲线模型Line
5个参数含义：(圆心横坐标, 圆心纵坐标, 飞线圆弧轨迹半径, 开始角度, 结束角度)*/
function circleLine(x, y, r, startAngle, endAngle,color) {
  const geometry = new THREE.BufferGeometry(); //声明一个几何体对象Geometry
  //  ArcCurve创建圆弧曲线
  const arc = new THREE.ArcCurve(x, y, r, startAngle, endAngle, false);
  //getSpacedPoints是基类Curve的方法，返回一个vector2对象作为元素组成的数组
  const points = arc.getSpacedPoints(80); //分段数50，返回51个顶点
  geometry.setFromPoints(points); // setFromPoints方法从points中提取数据改变几何体的顶点属性vertices
  const material = new THREE.LineBasicMaterial({
    color:color || 0xd18547,
  }); //线条材质
  const line = new THREE.Line(geometry, material); //线条模型对象
  return line;
}
//求三个点的外接圆圆心，p1, p2, p3表示三个点的坐标Vector3。
function threePointCenter(p1, p2, p3) {
  const L1 = p1.lengthSq(); //p1到坐标原点距离的平方
  const L2 = p2.lengthSq();
  const L3 = p3.lengthSq();
  const x1 = p1.x,
    y1 = p1.y,
    x2 = p2.x,
    y2 = p2.y,
    x3 = p3.x,
    y3 = p3.y;
  const S = x1 * y2 + x2 * y3 + x3 * y1 - x1 * y3 - x2 * y1 - x3 * y2;
  const x = (L2 * y3 + L1 * y2 + L3 * y1 - L2 * y1 - L3 * y2 - L1 * y3) / S / 2;
  const y = (L3 * x2 + L2 * x1 + L1 * x3 - L1 * x2 - L2 * x3 - L3 * x1) / S / 2;
  // 三点外接圆圆心坐标
  const center = new THREE.Vector3(x, y, 0);
  return center
}

// 绘制飞线
const f = flyArc(1, sites[0].lon, sites[0].lat, sites[1].lon, sites[1].lat, {color: 0xffffff, flyLineColor: 0x000000});
earthGroup.add(f);

function animate() {
  earthGroup.rotation.y += 0.001;
	renderer.render( scene, camera );
}