/** Suggestions for quick play; typed city names are also accepted by the gateway. */
export const STARTING_CITIES = [
  '上海', '北京', '广州', '深圳', '杭州', '南京', '苏州', '成都', '重庆', '武汉',
  '西安', '长沙', '郑州', '天津', '青岛', '济南', '合肥', '宁波', '厦门', '福州',
  '泉州', '东莞', '佛山', '珠海', '海口', '三亚', '昆明', '贵阳', '南宁', '南昌',
  '沈阳', '大连', '哈尔滨', '长春', '石家庄', '太原', '无锡', '温州', '常州', '南通',
] as const;
export function randomStartingCity(current: string, random = Math.random): string {
  const choices = STARTING_CITIES.filter(city => city !== current.trim());
  return choices[Math.floor(random() * choices.length)];
}
