import { generateNormalValue } from "@/core/audio/generateNormalValue.js"

/**
 * 生成符合正态分布的 Velocity 值（限制在指定范围内）
 * @param {number[]} range - Velocity 的最小值和最大值，例如 [20, 127]
 * @param {number} [mean] - 正态分布的均值（默认取范围中点）
 * @param {number} [stdDev] - 正态分布的标准差（默认取范围跨度的 1/4）
 * @returns {number} 符合正态分布且位于 range 内的整数 Velocity 值
 */
export function generateNormalVelocity(range, mean, stdDev) {
  return generateNormalValue(range, mean, stdDev)
}
