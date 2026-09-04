import { describe, it, expect, beforeEach } from 'vitest'
import { CusMath } from '../cusMath.js'

/**
 * 集成测试：覆盖表达式解析、括号优先级、负数全场景、
 * 链式与表达式混合，以及错误边界。
 */
describe('CusMath 集成测试', () => {
  let math

  beforeEach(() => {
    math = new CusMath()
  })

  describe('expression - 基础四则运算', () => {
    it('加减乘除与浮点精度', () => {
      expect(math.expression('0.1+0.2').end()).toBe(0.3)
      expect(new CusMath().expression('0.3-0.1').end()).toBe(0.2)
      expect(new CusMath().expression('0.1*0.2').end()).toBe(0.02)
      expect(new CusMath().expression('0.3/0.1').end()).toBe(3)
    })

    it('正数加法不把二元 + 当成数字前缀（+379.52 回归）', () => {
      expect(math.expression('100+379.52').end()).toBe(479.52)
      expect(new CusMath().expression('+10+379.52').end()).toBe(389.52)
      expect(new CusMath().expression('(100)+(279.52)').end()).toBe(379.52)
      expect(new CusMath().expression('100+(50+329.52)').end()).toBe(479.52)
    })

    it('乘除优先于加减', () => {
      expect(math.expression('1+2*3').end()).toBe(7)
      expect(new CusMath().expression('10-2*3').end()).toBe(4)
      expect(new CusMath().expression('1+6/2').end()).toBe(4)
      expect(new CusMath().expression('10-6/2').end()).toBe(7)
    })

    it('同级从左到右', () => {
      expect(math.expression('10-3-2').end()).toBe(5)
      expect(new CusMath().expression('2*3*4').end()).toBe(24)
      expect(new CusMath().expression('24/3/2').end()).toBe(4)
    })
  })

  describe('expression - 负数场景（原报错「存在非数字项」）', () => {
    it('表达式以负数开头', () => {
      expect(math.expression('-1+2').end()).toBe(1)
      expect(new CusMath().expression('-0.1+0.2').end()).toBe(0.1)
      expect(new CusMath().expression('-5*3').end()).toBe(-15)
      expect(new CusMath().expression('-0.3/0.1').end()).toBe(-3)
    })

    it('减负数 / 连续符号', () => {
      expect(math.expression('1+-2').end()).toBe(-1)
      expect(new CusMath().expression('1--2').end()).toBe(3)
      expect(new CusMath().expression('1-+2').end()).toBe(-1)
      expect(new CusMath().expression('0.1+-0.2').end()).toBe(-0.1)
      expect(new CusMath().expression('0.1--0.2').end()).toBe(0.3)
    })

    it('乘除负数字面量', () => {
      expect(math.expression('2*-3').end()).toBe(-6)
      expect(new CusMath().expression('2*-0.3').end()).toBe(-0.6)
      expect(new CusMath().expression('6/-2').end()).toBe(-3)
      expect(new CusMath().expression('-2*-3').end()).toBe(6)
      expect(new CusMath().expression('-0.1*-0.2').end()).toBe(0.02)
    })

    it('混合正负与优先级', () => {
      expect(math.expression('-1+2*3').end()).toBe(5)
      expect(new CusMath().expression('-10-2*3').end()).toBe(-16)
      expect(new CusMath().expression('1+-2*3').end()).toBe(-5)
      expect(new CusMath().expression('-0.1+0.2*0.3').end()).toBe(-0.04)
    })

    it('连续减法与加法浮点：-0.57-0.3+1', () => {
      // -0.57 - 0.3 + 1 = 0.13（原生 JS 易出现精度误差）
      expect(math.expression('-0.57-0.3+1').end()).toBe(0.13)
      expect(-0.57 - 0.3 + 1).not.toBe(0.13)
    })
  })

  describe('expression - 括号与负数中间结果', () => {
    it('简单括号', () => {
      expect(math.expression('(1+2)*3').end()).toBe(9)
      expect(new CusMath().expression('1+(2*3)').end()).toBe(7)
      expect(new CusMath().expression('(0.1+0.2)*0.3').end()).toBe(0.09)
    })

    it('括号结果为负数再参与运算（核心修复场景）', () => {
      expect(math.expression('(1-2)*3').end()).toBe(-3)
      expect(new CusMath().expression('2*(1-2)').end()).toBe(-2)
      expect(new CusMath().expression('10+(1-2)').end()).toBe(9)
      expect(new CusMath().expression('10-(1-2)').end()).toBe(11)
      expect(new CusMath().expression('(0.1-0.2)*0.3').end()).toBe(-0.03)
      expect(new CusMath().expression('0.1*(0.2-0.5)').end()).toBe(-0.03)
    })

    it('括号内本身为负数', () => {
      expect(math.expression('(-5)+3').end()).toBe(-2)
      expect(new CusMath().expression('(-5)*3').end()).toBe(-15)
      expect(new CusMath().expression('(-0.1)+(-0.2)').end()).toBe(-0.3)
      expect(new CusMath().expression('2*(-3)').end()).toBe(-6)
      expect(new CusMath().expression('6/(-2)').end()).toBe(-3)
    })

    it('多层嵌套括号含负数', () => {
      expect(math.expression('((1-2)*3)+4').end()).toBe(1)
      expect(new CusMath().expression('(1-(2-3))*4').end()).toBe(8)
      expect(new CusMath().expression('((0.1-0.2)-(0.3-0.4))*10').end()).toBe(0)
      expect(new CusMath().expression('(1+2)*(3-5)').end()).toBe(-6)
    })

    it('多个并列括号', () => {
      expect(math.expression('(1-2)+(3-4)').end()).toBe(-2)
      expect(new CusMath().expression('(1-2)*(3-4)').end()).toBe(1)
      expect(new CusMath().expression('(0.1+0.2)*(0.3-0.1)').end()).toBe(0.06)
    })
  })

  describe('expression - 复杂负数综合计算', () => {
    it('连续多段正负浮点加减', () => {
      // -0.57 - 0.3 + 1 - 0.2 = -0.07
      expect(math.expression('-0.57-0.3+1-0.2').end()).toBe(-0.07)
      // -0.1 + -0.2 * -0.3 - -0.4 = -0.1 + 0.06 + 0.4 = 0.36
      expect(new CusMath().expression('-0.1+-0.2*-0.3--0.4').end()).toBe(0.36)
      expect(new CusMath().expression('-1.25-0.75+2.5-0.5').end()).toBe(0)
    })

    it('多层括号内均为负数项', () => {
      // ((-1.5)+(-2.5))*(-0.2) = (-4)*(-0.2) = 0.8
      expect(math.expression('((-1.5)+(-2.5))*(-0.2)').end()).toBe(0.8)
      // ((-0.1-0.2)*(-3))+((-4)/(-2)) = 0.9 + 2 = 2.9
      expect(new CusMath().expression('((-0.1-0.2)*(-3))+((-4)/(-2))').end()).toBe(2.9)
      // ((-1)*(-2)*(-3))-((-4)*(-5)) = -6 - 20 = -26
      expect(new CusMath().expression('((-1)*(-2)*(-3))-((-4)*(-5))').end()).toBe(-26)
    })

    it('负号包裹整段括号表达式', () => {
      // -((1-2)*(3-5))+(-0.1) = -((-1)*(-2))+(-0.1) = -2 - 0.1 = -2.1
      expect(math.expression('-((1-2)*(3-5))+(-0.1)').end()).toBe(-2.1)
      // -(((1+2)*(-3))-((-4)+5)) = -((-9)-1) = -(-10) = 10
      expect(new CusMath().expression('-(((1+2)*(-3))-((-4)+5))').end()).toBe(10)
    })

    it('负数乘除与加减混合优先级', () => {
      // -1.1*(-2.2)-(-3.3) = 2.42 + 3.3 = 5.72
      expect(math.expression('-1.1*(-2.2)-(-3.3)').end()).toBe(5.72)
      // -2.5*3.4+(-1.2)/0.4-(-0.5) = -8.5 + (-3) + 0.5 = -11
      expect(new CusMath().expression('-2.5*3.4+(-1.2)/0.4-(-0.5)').end()).toBe(-11)
      // 10/(-2)/(-5)*(-1) = ((-5)/(-5))*(-1) = 1*(-1) = -1
      expect(new CusMath().expression('10/(-2)/(-5)*(-1)').end()).toBe(-1)
    })

    it('括号结果为负再与负号运算', () => {
      // (0.1-0.2)*(0.3-0.5)-(-0.04) = (-0.1)*(-0.2)+0.04 = 0.02+0.04 = 0.06
      expect(math.expression('(0.1-0.2)*(0.3-0.5)-(-0.04)').end()).toBe(0.06)
      // (1+-2)*(-3+-4)--5 = (-1)*(-7)+5 = 7+5 = 12
      expect(new CusMath().expression('(1+-2)*(-3+-4)--5').end()).toBe(12)
      // (-0.57-0.3+1)*(-2)+0.26 = 0.13*(-2)+0.26 = 0
      expect(new CusMath().expression('(-0.57-0.3+1)*(-2)+0.26').end()).toBe(0)
    })

    it('深层嵌套减法链（负负得正）', () => {
      // 1-(2-(3-(4-5))) = 1-(2-(3-(-1))) = 1-(2-4) = 1-(-2) = 3
      expect(math.expression('1-(2-(3-(4-5)))').end()).toBe(3)
      // 0-(-0.1-(-0.2-(-0.3))) = 0-(-0.1-(-0.2+0.3)) = 0-(-0.1-0.1) = 0-(-0.2) = 0.2
      expect(new CusMath().expression('0-(-0.1-(-0.2-(-0.3)))').end()).toBe(0.2)
      // -(-(-1.5)) 通过括号展开：-((-(1.5))) 无此语法，用等价式
      expect(new CusMath().expression('-(-1.5-(-2.5))').end()).toBe(-1)
    })

    it('复杂负数 + 链式二次加工', () => {
      // 表达式得 5.72，再 sub(0.72).div(-1) => -5
      expect(
        new CusMath().expression('-1.1*(-2.2)-(-3.3)').sub(0.72).div(-1).end()
      ).toBe(-5)
      // (-0.57-0.3+1)=0.13，mul(-10)=-1.3，add(1.3)=0
      expect(
        new CusMath().expression('-0.57-0.3+1').mul(-10).add(1.3).end()
      ).toBe(0)
    })

    it.each([
      ['-0.57-0.3+1-0.2', -0.07],
      ['((-1.5)+(-2.5))*(-0.2)', 0.8],
      ['-1.1*(-2.2)-(-3.3)', 5.72],
      ['(0.1-0.2)*(0.3-0.5)-(-0.04)', 0.06],
      ['-((1-2)*(3-5))+(-0.1)', -2.1],
      ['10/(-2)/(-5)*(-1)', -1],
      ['-0.1+-0.2*-0.3--0.4', 0.36],
      ['((-0.1-0.2)*(-3))+((-4)/(-2))', 2.9],
      ['1-(2-(3-(4-5)))', 3],
      ['-(((1+2)*(-3))-((-4)+5))', 10],
      ['(-0.57-0.3+1)*(-2)+0.26', 0],
      ['(1+-2)*(-3+-4)--5', 12],
      ['-2.5*3.4+(-1.2)/0.4-(-0.5)', -11],
      ['((-1)*(-2)*(-3))-((-4)*(-5))', -26],
      ['0-(-0.1-(-0.2-(-0.3)))', 0.2],
      ['-(-1.5-(-2.5))', -1],
      ['((-0.25)+0.75)*(-1.2)-(-0.3)', -0.3],
      ['3*(-2)+(-4)*(-5)-(-1)', 15],
    ])('复杂负数矩阵 expression(%s) => %s', (exp, expected) => {
      expect(new CusMath().expression(exp).end()).toBe(expected)
    })
  })

  describe('expression - 空白与复杂综合', () => {
    it('允许空格', () => {
      expect(math.expression(' 0.1 + 0.2 ').end()).toBe(0.3)
      expect(new CusMath().expression(' ( 1 - 2 ) * 3 ').end()).toBe(-3)
      expect(new CusMath().expression('- 1 + 2 * 3').end()).toBe(5)
    })

    it('复杂综合表达式', () => {
      // (0.1+0.2)*3 - 0.1/0.2 = 0.9 - 0.5 = 0.4
      expect(math.expression('(0.1+0.2)*3-0.1/0.2').end()).toBe(0.4)
      // 1-(2-(3-4)) = 1-(2-(-1)) = 1-3 = -2
      expect(new CusMath().expression('1-(2-(3-4))').end()).toBe(-2)
      // -1.5*2+(3/(-1.5)) = -3 + (-2) = -5
      expect(new CusMath().expression('-1.5*2+(3/(-1.5))').end()).toBe(-5)
    })
  })

  describe('链式 + 表达式混合流程', () => {
    it('先表达式再链式', () => {
      const m = new CusMath()
      // (1-2)*3 = -3，再加 0.1 = -2.9
      expect(m.expression('(1-2)*3').add(0.1).end()).toBe(-2.9)
    })

    it('先链式再表达式会覆盖过程值', () => {
      const m = new CusMath()
      m.add(100)
      expect(m.expression('0.1+0.2').end()).toBe(0.3)
    })

    it('多次 end 与重新计算', () => {
      const m = new CusMath()
      expect(m.expression('-1*0.2').end()).toBe(-0.2)
      expect(m.expression('(5-8)/3').end()).toBe(-1)
      expect(m.add(-0.1, -0.2).mul(2).end()).toBe(-0.6)
    })
  })

  describe('错误与边界场景', () => {
    it('空表达式抛错', () => {
      expect(() => math.expression('')).toThrow('数学表达式为字符串且不能为空')
      expect(() => math.expression(null)).toThrow('数学表达式为字符串且不能为空')
      expect(() => math.expression(123)).toThrow('数学表达式为字符串且不能为空')
    })

    it('非法字符抛错', () => {
      expect(() => math.expression('1+2a')).toThrow('无效数学表达式')
      expect(() => math.expression('1&2')).toThrow('无效数学表达式')
    })

    it('连续 ** 或 // 非法', () => {
      expect(() => math.expression('2**3')).toThrow('无效数学表达式')
      expect(() => math.expression('2//3')).toThrow('无效数学表达式')
    })

    it('仅数字表达式', () => {
      expect(math.expression('42').end()).toBe(42)
      expect(new CusMath().expression('-42').end()).toBe(-42)
      expect(new CusMath().expression('-0.5').end()).toBe(-0.5)
    })

    it('导出单例 cusMath 可独立使用', async () => {
      const { cusMath } = await import('../cusMath.js')
      expect(cusMath.expression('(1-2)*3').end()).toBe(-3)
      expect(cusMath.add(-0.1).add(-0.2).end()).toBe(-0.3)
    })
  })

  describe('全场景矩阵快照', () => {
    const cases = [
      // [表达式, 期望值]
      ['1+1', 2],
      ['1-1', 0],
      ['1*1', 1],
      ['1/1', 1],
      ['-1+-1', -2],
      ['-1--1', 0],
      ['-1*-1', 1],
      ['-1/-1', 1],
      ['0.1+0.2+0.3', 0.6],
      ['0.1*0.1*0.1', 0.001],
      ['(1)', 1],
      ['(-1)', -1],
      ['(-(1+2))', -3],
      ['1+2+3+4+5', 15],
      ['100-0.1-0.2', 99.7],
      ['((2))', 2],
      ['3*(2+(1-4))', -3],
      ['(0.1-0.2)/(0.1-0.2)', 1],
      ['-0.57-0.3+1', 0.13],
      ['+1+2', 3],
      ['2*+3', 6],
      ['1.001-0.1', 0.901],
    ]

    it.each(cases)('expression(%s) => %s', (exp, expected) => {
      expect(new CusMath().expression(exp).end()).toBe(expected)
    })
  })

  describe('除零与畸形表达式（文档化当前行为）', () => {
    it('除零得到 Infinity', () => {
      expect(math.expression('1/0').end()).toBe(Infinity)
      expect(new CusMath().expression('-1/0').end()).toBe(-Infinity)
      expect(new CusMath().expression('(2-1)/0').end()).toBe(Infinity)
    })

    it('0/0 当前实现返回 0（NaN 被 convertNumber 兜底）', () => {
      expect(new CusMath().expression('0/0').end()).toBe(0)
      expect(CusMath.accDiv(0, 0)).toBe(0)
    })

    it('一元正号表达式', () => {
      expect(math.expression('+1+2').end()).toBe(3)
      expect(new CusMath().expression('2*+3').end()).toBe(6)
      expect(new CusMath().expression('+0.1++0.2').end()).toBe(0.3)
    })

    it('尾部运算符 / 空括号 / 未闭合括号（宽松解析）', () => {
      expect(math.expression('1+').end()).toBe(1)
      expect(new CusMath().expression('()').end()).toBe(0)
      // 无闭合括号时当作无括号，忽略 '(' 字符
      expect(new CusMath().expression('(1+2').end()).toBe(3)
    })

    it('以乘除运算符开头抛错', () => {
      expect(() => math.expression('*2').end()).toThrow('逻辑错误')
      expect(() => new CusMath().expression('/2').end()).toThrow('逻辑错误')
    })
  })

  describe('科学计数法与极小值回写', () => {
    it('expression 层校验不接受 e/E（字面量科学计数法）', () => {
      expect(() => math.expression('1e-7*10')).toThrow('无效数学表达式')
      expect(() => new CusMath().expression('1E+2+3')).toThrow('无效数学表达式')
      // 底层拆解仍可解析（供内部/扩展使用）
      expect(new CusMath().getExpParts('1e-7')).toEqual(['1e-7'])
      expect(new CusMath().calcFlatExpress('1e-7*10')).toBe(0.000001)
    })

    it('括号中间结果为极小值再参与运算', () => {
      // (1e-7) 回写为 0.0000001，再 *10
      expect(math.expression('(0.0000001)*10').end()).toBe(0.000001)
      expect(new CusMath().expression('(1/10000000)*10').end()).toBe(0.000001)
    })
  })

  describe('精度边界集成', () => {
    it('不同小数位连续运算', () => {
      expect(math.expression('1.001-0.1').end()).toBe(0.901)
      expect(new CusMath().expression('1.001+0.1').end()).toBe(1.101)
      expect(new CusMath().expression('19.9*100').end()).toBe(1990)
      expect(new CusMath().expression('0.1+0.2+0.3-0.6').end()).toBe(0)
    })

    it('长链式混合四则', () => {
      // ((0.1+0.2)*3 - 0.1) / 0.2 = (0.9-0.1)/0.2 = 4
      expect(math.expression('((0.1+0.2)*3-0.1)/0.2').end()).toBe(4)
      expect(new CusMath().add(0.1).add(0.2).mul(3).sub(0.1).div(0.2).end()).toBe(4)
    })
  })

  describe('状态与日志集成', () => {
    it('表达式计算后 end 清空全部状态', () => {
      const m = new CusMath()
      m.expression('(1-2)*3')
      expect(m._processValue).toBe(-3)
      expect(m._original_expression).toBe('(1-2)*3')
      expect(m._logs.length).toBeGreaterThan(0)

      expect(m.end()).toBe(-3)
      expect(m._processValue).toBe(0)
      expect(m._original_expression).toBe('')
      expect(m._process_expression).toBe('')
      expect(m._logs).toEqual([])
    })

    it('链式多参与空操作混合', () => {
      const m = new CusMath()
      m.add(1, 2, 3) // 0+1+2+3=6
      m.operation('add') // 空参，不变
      expect(m.mul(0.5).end()).toBe(3)
    })
  })
})
