import { describe, it, expect, beforeEach } from 'vitest'
import { CusMath, cusMath } from '../cusMath.js'

describe('CusMath 静态方法 - 单元测试', () => {
  describe('accAdd', () => {
    it('解决浮点加法精度问题', () => {
      expect(CusMath.accAdd(0.1, 0.2)).toBe(0.3)
      expect(0.1 + 0.2).not.toBe(0.3)
    })

    it('正数相加', () => {
      expect(CusMath.accAdd(1.23, 4.56)).toBe(5.79)
      expect(CusMath.accAdd(100, 200)).toBe(300)
    })

    it('负数相加', () => {
      expect(CusMath.accAdd(-0.1, -0.2)).toBe(-0.3)
      expect(CusMath.accAdd(-1.5, -2.5)).toBe(-4)
    })

    it('正负数混合相加', () => {
      expect(CusMath.accAdd(0.3, -0.1)).toBe(0.2)
      expect(CusMath.accAdd(-0.3, 0.1)).toBe(-0.2)
      expect(CusMath.accAdd(5, -5)).toBe(0)
      expect(CusMath.accAdd(-5, 5)).toBe(0)
    })

    it('与 0 相加', () => {
      expect(CusMath.accAdd(0, 0.1)).toBe(0.1)
      expect(CusMath.accAdd(-0.1, 0)).toBe(-0.1)
      expect(CusMath.accAdd(0, 0)).toBe(0)
    })

    it('字符串数字入参', () => {
      expect(CusMath.accAdd('0.1', '0.2')).toBe(0.3)
      expect(CusMath.accAdd('-0.1', '0.2')).toBe(0.1)
    })
  })

  describe('accSub', () => {
    it('解决浮点减法精度问题', () => {
      expect(CusMath.accSub(0.3, 0.1)).toBe(0.2)
    })

    it('正数相减', () => {
      expect(CusMath.accSub(5.5, 2.2)).toBe(3.3)
      expect(CusMath.accSub(10, 3)).toBe(7)
    })

    it('减数为负数（减去负数等于加）', () => {
      expect(CusMath.accSub(0.1, -0.2)).toBe(0.3)
      expect(CusMath.accSub(5, -3)).toBe(8)
    })

    it('被减数为负数', () => {
      expect(CusMath.accSub(-0.1, 0.2)).toBe(-0.3)
      expect(CusMath.accSub(-5, 3)).toBe(-8)
    })

    it('两负数相减', () => {
      expect(CusMath.accSub(-0.3, -0.1)).toBe(-0.2)
      expect(CusMath.accSub(-5, -8)).toBe(3)
    })

    it('结果为 0', () => {
      expect(CusMath.accSub(1.1, 1.1)).toBe(0)
      expect(CusMath.accSub(-2.5, -2.5)).toBe(0)
    })
  })

  describe('accMul', () => {
    it('解决浮点乘法精度问题', () => {
      expect(CusMath.accMul(0.1, 0.2)).toBe(0.02)
      expect(0.1 * 0.2).not.toBe(0.02)
    })

    it('正数相乘', () => {
      expect(CusMath.accMul(1.2, 3)).toBe(3.6)
      expect(CusMath.accMul(19.9, 100)).toBe(1990)
    })

    it('负数相乘', () => {
      expect(CusMath.accMul(-0.1, 0.2)).toBe(-0.02)
      expect(CusMath.accMul(0.1, -0.2)).toBe(-0.02)
      expect(CusMath.accMul(-0.1, -0.2)).toBe(0.02)
      expect(CusMath.accMul(-3, 4)).toBe(-12)
      expect(CusMath.accMul(-3, -4)).toBe(12)
    })

    it('与 0 相乘', () => {
      expect(CusMath.accMul(0, 0.2)).toBe(0)
      expect(CusMath.accMul(-1.5, 0)).toBe(0)
    })
  })

  describe('accDiv', () => {
    it('解决浮点除法精度问题', () => {
      expect(CusMath.accDiv(0.3, 0.1)).toBe(3)
    })

    it('正数相除', () => {
      expect(CusMath.accDiv(1.21, 1.1)).toBe(1.1)
      expect(CusMath.accDiv(10, 4)).toBe(2.5)
    })

    it('负数相除', () => {
      expect(CusMath.accDiv(-0.3, 0.1)).toBe(-3)
      expect(CusMath.accDiv(0.3, -0.1)).toBe(-3)
      expect(CusMath.accDiv(-0.3, -0.1)).toBe(3)
      expect(CusMath.accDiv(-12, 4)).toBe(-3)
      expect(CusMath.accDiv(-12, -3)).toBe(4)
    })

    it('除以小数', () => {
      expect(CusMath.accDiv(1, 0.1)).toBe(10)
      expect(CusMath.accDiv(-1, 0.1)).toBe(-10)
    })
  })

  describe('getPrecision / convertNumber', () => {
    it('getPrecision 正确获取小数位', () => {
      expect(CusMath.getPrecision(1)).toBe(0)
      expect(CusMath.getPrecision(1.2)).toBe(1)
      expect(CusMath.getPrecision(1.23)).toBe(2)
      expect(CusMath.getPrecision(-1.23)).toBe(2)
      expect(CusMath.getPrecision('3.1415')).toBe(4)
    })

    it('convertNumber 非法值转 0', () => {
      expect(CusMath.convertNumber('abc')).toBe(0)
      expect(CusMath.convertNumber(null)).toBe(0)
      expect(CusMath.convertNumber(undefined)).toBe(0)
      expect(CusMath.convertNumber('-1.5')).toBe(-1.5)
    })
  })
})

describe('CusMath 实例方法 - 单元测试', () => {
  let math

  beforeEach(() => {
    math = new CusMath()
  })

  describe('getExpParts（负数拆解）', () => {
    it('普通表达式', () => {
      expect(math.getExpParts('1+2*3')).toEqual(['1', '+', '2', '*', '3'])
    })

    it('开头为负数', () => {
      expect(math.getExpParts('-1+2')).toEqual(['-1', '+', '2'])
      expect(math.getExpParts('-1.5*3')).toEqual(['-1.5', '*', '3'])
    })

    it('乘除后接负数', () => {
      expect(math.getExpParts('2*-3')).toEqual(['2', '*', '-3'])
      expect(math.getExpParts('6/-2')).toEqual(['6', '/', '-2'])
      expect(math.getExpParts('2*-3.5')).toEqual(['2', '*', '-3.5'])
    })

    it('连续符号归一化后拆解', () => {
      expect(math.getExpParts('1+-2')).toEqual(['1', '-', '2'])
      expect(math.getExpParts('1--2')).toEqual(['1', '+', '2'])
      expect(math.getExpParts('1-+2')).toEqual(['1', '-', '2'])
    })

    it('多个负数项', () => {
      expect(math.getExpParts('-1+-2*-3')).toEqual(['-1', '-', '2', '*', '-3'])
    })

    it('连续减加：-0.57-0.3+1', () => {
      expect(math.getExpParts('-0.57-0.3+1')).toEqual(['-0.57', '-', '0.3', '+', '1'])
    })

    it('二元加号不能吞进右侧数字（小程序 lookbehind 失效回归）', () => {
      // 错误拆解会得到 ['100','+379.52']，加减阶段报「存在非数学运算符【+379.52】」
      expect(math.getExpParts('100+379.52')).toEqual(['100', '+', '379.52'])
      expect(math.getExpParts('+10+379.52')).toEqual(['+10', '+', '379.52'])
      expect(math.getExpParts('10+20+379.52')).toEqual(['10', '+', '20', '+', '379.52'])
    })
  })

  describe('isNumber', () => {
    it('识别数字与负数', () => {
      expect(math.isNumber('12')).toBe(true)
      expect(math.isNumber('-12.5')).toBe(true)
      expect(math.isNumber('+3')).toBe(true)
      expect(math.isNumber('-')).toBe(false)
      expect(math.isNumber('')).toBe(false)
      expect(math.isNumber('*')).toBe(false)
    })
  })

  describe('formatNumberForExpression', () => {
    it('格式化正负数且无科学计数法', () => {
      expect(math.formatNumberForExpression(-1)).toBe('-1')
      expect(math.formatNumberForExpression(0.3)).toBe('0.3')
      expect(math.formatNumberForExpression(0)).toBe('0')
      expect(math.formatNumberForExpression(-0.02)).toBe('-0.02')
    })
  })

  describe('链式调用 add/sub/mul/div', () => {
    it('正数链式加减乘除', () => {
      expect(math.add(0.1, 0.2).end()).toBe(0.3)
      expect(new CusMath().add(0.1).add(0.2).end()).toBe(0.3)
      expect(new CusMath().add(1).mul(0.3).end()).toBe(0.3)
      expect(new CusMath().add(0.3).sub(0.1).end()).toBe(0.2)
      expect(new CusMath().add(0.3).div(0.1).end()).toBe(3)
    })

    it('负数链式运算', () => {
      expect(new CusMath().add(-0.1).add(-0.2).end()).toBe(-0.3)
      expect(new CusMath().add(-0.1, -0.2).end()).toBe(-0.3)
      expect(new CusMath().add(1).sub(-0.2).end()).toBe(1.2)
      expect(new CusMath().add(-2).mul(-3).end()).toBe(6)
      expect(new CusMath().add(-0.3).div(0.1).end()).toBe(-3)
      expect(new CusMath().add(-0.3).div(-0.1).end()).toBe(3)
    })

    it('end 后重置状态', () => {
      const m = new CusMath()
      m.add(10)
      expect(m.end()).toBe(10)
      expect(m.end()).toBe(0)
    })
  })

  describe('辅助方法', () => {
    it('百分比互转支持负数', () => {
      expect(math.isPercentage('-20%')).toBe(true)
      expect(math.convertPercentageToNum('20%')).toBe(0.2)
      expect(math.convertPercentageToNum('-20%')).toBe(-0.2)
      expect(math.convertNumToPercentage(-0.2)).toBe('-20.00%')
      expect(math.convertPercentageToNum('abc')).toBe(0)
    })

    it('numberRoundUp', () => {
      expect(math.numberRoundUp(1.2345)).toBe(1.235)
      expect(math.numberRoundUp(-1.2345)).toBe(-1.234)
      expect(math.numberRoundUp(1.2345, 3, 'roundDown')).toBe(1.234)
      expect(math.numberRoundUp(1.2341, 3, 'roundUp')).toBe(1.235)
      expect(math.numberRoundUp(0)).toBe(0)
    })

    it('convertNumToPercentage 空值与非法', () => {
      expect(math.convertNumToPercentage('')).toBe('0%')
      expect(math.convertNumToPercentage(null)).toBe('0%')
      expect(math.convertNumToPercentage('abc')).toBe('0%')
      expect(math.convertNumToPercentage(0.5, 1)).toBe('50.0%')
    })

    it('百分比小数 12.5%', () => {
      expect(math.isPercentage('12.5%')).toBe(true)
      expect(math.convertPercentageToNum('12.5%')).toBe(0.125)
    })

    it('isOddNumber / isNotEmptyArr', () => {
      expect(math.isOddNumber(1)).toBe(true)
      expect(math.isOddNumber(2)).toBe(false)
      expect(math.isNotEmptyArr([])).toBe(false)
      expect(math.isNotEmptyArr([1])).toBe(true)
      expect(math.isNotEmptyArr(null)).toBe(false)
      expect(math.isNotEmptyArr('x')).toBe(false)
    })

    it('isNumber 排除 boolean / null', () => {
      expect(math.isNumber(true)).toBe(false)
      expect(math.isNumber(false)).toBe(false)
      expect(math.isNumber(null)).toBe(false)
      expect(math.isNumber(undefined)).toBe(false)
      expect(math.isNumber(0)).toBe(true)
    })
  })

  describe('normalizeSigns / validateExpression / getFirstBracketExpress', () => {
    it('normalizeSigns 折叠连续正负号', () => {
      expect(math.normalizeSigns('1++2')).toBe('1+2')
      expect(math.normalizeSigns('1+-2')).toBe('1-2')
      expect(math.normalizeSigns('1--2')).toBe('1+2')
      expect(math.normalizeSigns('1-+2')).toBe('1-2')
      expect(math.normalizeSigns('1++--+2')).toBe('1+2')
      expect(math.normalizeSigns(' 1 + 2 ')).toBe('1+2')
    })

    it('validateExpression 合法与非法', () => {
      expect(math.validateExpression('1+2*3')).toBe(true)
      expect(math.validateExpression('-0.57-0.3+1')).toBe(true)
      expect(math.validateExpression('()')).toBe(true)
      expect(math.validateExpression('1+')).toBe(true) // 字符合法，语义另测
      expect(math.validateExpression('1+2a')).toBe(false)
      expect(math.validateExpression('2**3')).toBe(false)
      expect(math.validateExpression('2//3')).toBe(false)
      expect(math.validateExpression('1&2')).toBe(false)
    })

    it('getFirstBracketExpress 提取一级括号', () => {
      expect(math.getFirstBracketExpress('(1+2)*(3-4)')).toEqual(['1+2', '3-4'])
      expect(math.getFirstBracketExpress('((1+2))')).toEqual(['1+2'])
      expect(math.getFirstBracketExpress('1+2')).toEqual([])
      expect(math.getFirstBracketExpress('(1+2')).toEqual([]) // 无闭合括号
    })
  })

  describe('calcFlatExpress / getFlatExpressResult', () => {
    it('空串与单数字', () => {
      expect(math.calcFlatExpress('')).toBe(0)
      expect(math.calcFlatExpress('42')).toBe(42)
      expect(math.calcFlatExpress('-0.5')).toBe(-0.5)
    })

    it('先乘除后加减', () => {
      expect(math.calcFlatExpress('1+2*3')).toBe(7)
      expect(math.calcFlatExpress('10-6/2')).toBe(7)
      expect(math.calcFlatExpress('-0.57-0.3+1')).toBe(0.13)
    })

    it('getFlatExpressResult 与 calcFlatExpress 一致', () => {
      expect(math.getFlatExpressResult('2*3+4')).toBe(10)
      expect(math.getFlatExpressResult('2*-3')).toBe(-6)
    })

    it('畸形：尾部运算符按 +0 处理', () => {
      expect(math.calcFlatExpress('1+')).toBe(1)
    })

    it('畸形：以运算符开头抛逻辑错误', () => {
      expect(() => math.calcFlatExpress('*2')).toThrow('逻辑错误')
    })
  })

  describe('科学计数法与精度边界', () => {
    it('getExpParts 解析科学计数法', () => {
      expect(math.getExpParts('1e-7')).toEqual(['1e-7'])
      expect(math.getExpParts('2*1e-3')).toEqual(['2', '*', '1e-3'])
      expect(math.getExpParts('1E+2+3')).toEqual(['1E+2', '+', '3'])
    })

    it('getPrecision 支持科学计数法', () => {
      expect(CusMath.getPrecision(1e-7)).toBe(7)
      expect(CusMath.getPrecision(1.5e-5)).toBeGreaterThan(0)
    })

    it('formatNumberForExpression 避免科学计数法回写', () => {
      expect(math.formatNumberForExpression(1e-7)).toBe('0.0000001')
      expect(math.formatNumberForExpression(Infinity)).toBe('0')
      expect(math.formatNumberForExpression(NaN)).toBe('0')
    })

    it('不同小数位加减精度', () => {
      expect(CusMath.accSub(1.001, 0.1)).toBe(0.901)
      expect(CusMath.accAdd(1.001, 0.1)).toBe(1.101)
      expect(CusMath.accMul(1.001, 0.1)).toBe(0.1001)
    })
  })

  describe('一元正号', () => {
    it('getExpParts 识别一元 +（保留为 +n 字面量）', () => {
      expect(math.getExpParts('+1+2')).toEqual(['+1', '+', '2'])
      expect(math.getExpParts('2*+3')).toEqual(['2', '*', '+3'])
      expect(math.isNumber('+1')).toBe(true)
      expect(math.convertNumber('+3')).toBe(3)
    })
  })

  describe('除零', () => {
    it('accDiv 除零返回 Infinity', () => {
      expect(CusMath.accDiv(1, 0)).toBe(Infinity)
      expect(CusMath.accDiv(-1, 0)).toBe(-Infinity)
    })
  })

  describe('链式边界与日志状态', () => {
    it('空参数 / 非法 type 不改变过程值', () => {
      const m = new CusMath()
      m.add(5)
      expect(m.operation('add').end()).toBe(5)
      const m2 = new CusMath()
      m2.add(5)
      expect(m2.operation('noop', 1).end()).toBe(5)
    })

    it('多参数 reduce：add(1,2,3) => 6', () => {
      expect(new CusMath().add(1, 2, 3).end()).toBe(6)
    })

    it('logPush 记录链式操作，end 清空日志与表达式', () => {
      const m = new CusMath()
      m.add(0.1).add(0.2)
      expect(m._logs.length).toBe(2)
      expect(m._logs[0].operationName).toBe('accAdd')
      expect(m._logs[1].result).toBe(0.3)
      expect(m._processValue).toBe(0.3)

      expect(m.end()).toBe(0.3)
      expect(m._logs).toEqual([])
      expect(m._processValue).toBe(0)
      expect(m._original_expression).toBe('')
      expect(m._process_expression).toBe('')
    })

    it('expression 写入原始表达式与过程日志', () => {
      const m = new CusMath()
      m.expression('0.1+0.2')
      expect(m._original_expression).toBe('0.1+0.2')
      expect(m._process_expression).toBe('0.1+0.2')
      expect(m._logs.length).toBeGreaterThanOrEqual(2)
      m.end()
      expect(m._original_expression).toBe('')
    })
  })
})
