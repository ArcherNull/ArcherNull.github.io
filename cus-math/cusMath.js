/*
 * @Author: Null 779217162@qq.com
 * @Description: 自定义高精度计算类（解决 JS 浮点精度问题，支持负数表达式）
 */
export class CusMath {
    static _precision = 15

    _logs = []
    _processValue = 0
    _original_expression = ''
    _process_expression = ''

    constructor() {
        this.init()
    }

    init() {
        Object.keys(this.operationProxy).forEach(funName => {
            this[funName] = (...args) => this.operation(funName, ...args)
        })
    }

    get operationProxy() {
        return {
            add: CusMath.accAdd,
            sub: CusMath.accSub,
            mul: CusMath.accMul,
            div: CusMath.accDiv,
        }
    }

    get expressionOperationProxy() {
        return {
            '+': CusMath.accAdd,
            '-': CusMath.accSub,
            '*': CusMath.accMul,
            '/': CusMath.accDiv,
        }
    }

    operation(type, ...args) {
        const operaFun = this.operationProxy[type]
        if (typeof operaFun !== 'function' || !this.isNotEmptyArr(args)) return this

        this._processValue = args.reduce((a, b) => {
            const val = operaFun(this.convertNumber(a), this.convertNumber(b))
            this.logPush({
                operationName: operaFun?.name,
                result: val,
                type: 'chain',
                params: [a, b],
            })
            return val
        }, this._processValue)

        return this
    }

    logPush({ operationName, result, params, type }) {
        this._logs.push({ operationName, result, type, params })
    }

    expLogPush(str) {
        str && !this._logs.includes(str) && this._logs.push(str)
    }

    expression(expStr) {
        if (!expStr || typeof expStr !== 'string') {
            throw new Error('数学表达式为字符串且不能为空')
        }
        if (!this.validateExpression(expStr)) {
            throw new Error('无效数学表达式')
        }

        this._original_expression = expStr
        this._process_expression = expStr
        this.expLogPush(this._process_expression)

        try {
            const result = this.dealAndCalcFirstBracketArr()
            this.expLogPush(result)
            this._processValue = result
            return this
        } catch (err) {
            throw new Error(err)
        }
    }

    getFirstBracketExpress(newStr) {
        const nStr = String(newStr)
        if (!nStr.includes('(') || !nStr.includes(')')) return []
        return [...(nStr.matchAll(/\(([^()]+)\)/g) || [])].map(m => m[1])
    }

    dealAndCalcFirstBracketArr() {
        const bracketArr = this.getFirstBracketExpress(this._process_expression)
        if (!this.isNotEmptyArr(bracketArr)) {
            this.expLogPush(this._process_expression)
            return this.calcFlatExpress(this._process_expression)
        }

        for (const bracketExpStr of bracketArr) {
            const resultVal = this.calcFlatExpress(bracketExpStr)
            this._process_expression = this._process_expression.replace(
                `(${bracketExpStr})`,
                this.formatNumberForExpression(resultVal)
            )
            this.expLogPush(this._process_expression)
        }
        return this.dealAndCalcFirstBracketArr()
    }

    /** 数值转可再解析的表达式片段（避免科学计数法） */
    formatNumberForExpression(num) {
        const n = this.convertNumber(num)
        if (!Number.isFinite(n) || n === 0) return '0'
        return n.toFixed(12).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
    }

    /** 折叠连续正负号 */
    normalizeSigns(expStr) {
        let s = String(expStr ?? '').replace(/\s/g, '')
        let prev
        do {
            prev = s
            s = s.replace(/\+\+/g, '+').replace(/\+\-/g, '-').replace(/\-\+/g, '-').replace(/\-\-/g, '+')
        } while (prev !== s)
        return s
    }

    /** 计算无括号表达式：先乘除后加减 */
    calcFlatExpress(expStr) {
        const parts = this.getExpParts(expStr)
        if (!this.isNotEmptyArr(parts)) return 0
        if (parts.length === 1) {
            if (!this.isNumber(parts[0])) throw new Error(`存在非数字项【${parts[0]}】`)
            return this.convertNumber(parts[0])
        }

        // 先乘除
        const stack = []
        for (let i = 0; i < parts.length; i++) {
            const token = parts[i]
            if (token === '*' || token === '/') {
                if (!stack.length || i + 1 >= parts.length) throw new Error('逻辑错误')
                const left = this.convertNumber(stack.pop())
                const right = this.convertNumber(parts[++i])
                stack.push(token === '*' ? CusMath.accMul(left, right) : CusMath.accDiv(left, right))
            } else {
                stack.push(token)
            }
        }

        // 再加减
        let val = this.convertNumber(stack[0])
        for (let i = 1; i < stack.length; i += 2) {
            const op = stack[i]
            const right = this.convertNumber(stack[i + 1])
            const fn = this.expressionOperationProxy[op]
            if (!fn) throw new Error(`存在非数学运算符【${op}】`)
            val = fn(val, right)
        }
        return val
    }

    /** 无优先级从左到右计算（保留 API，内部复用 calcFlatExpress） */
    getFlatExpressResult(expStr) {
        return this.calcFlatExpress(expStr)
    }

    /**
     * 拆解表达式：支持负数、一元正负号、科学计数法
     * 一元正负号：开头或运算符之后（如 *-2、+379.52）
     * 不用 lookbehind：小程序等引擎对 (?<=) 支持差；若写成 [+-]?\d+
     * 会把二元 + 吞进数字，例如 100+379.52 → ['100','+379.52'] 触发「非数学运算符」
     */
    getExpParts(expStr) {
        const s = this.normalizeSigns(expStr)
        if (!s) return []

        const raw = s.match(/\d*\.?\d+(?:[eE][+-]?\d+)?|[+\-*/]/g) || []
        const parts = []
        const isOp = t => t === '+' || t === '-' || t === '*' || t === '/'

        for (let i = 0; i < raw.length; i++) {
            const token = raw[i]
            const next = raw[i + 1]
            const isUnary =
                (token === '+' || token === '-') &&
                next != null &&
                !isOp(next) &&
                (parts.length === 0 || isOp(parts[parts.length - 1]))

            if (isUnary) {
                parts.push(token + next)
                i++
            } else {
                parts.push(token)
            }
        }
        return parts
    }

    validateExpression(str) {
        const newStr = str.replace(/\s/g, '')
        const noDoubleMul = /^([^*]|\*[^*])*$/.test(newStr)
        const noDoubleDiv = /^([^/]|\/[^/])*$/.test(newStr)
        const rest = newStr.replace(/\d+|[+\-*/().]/g, '')
        return noDoubleMul && noDoubleDiv && !rest
    }

    end() {
        const endVal = this._processValue
        this._processValue = 0
        this._original_expression = ''
        this._process_expression = ''
        this._logs = []
        return endVal
    }

    static accAdd(arg1, arg2) {
        const r1 = CusMath.getPrecision(arg1)
        const r2 = CusMath.getPrecision(arg2)
        const m = Math.pow(10, Math.max(r1, r2))
        const val = (CusMath.convertNumber(arg1) * m + CusMath.convertNumber(arg2) * m) / m || 0
        return val ? Number(val.toPrecision(CusMath._precision)) : 0
    }

    static accSub(arg1, arg2) {
        const r1 = CusMath.getPrecision(arg1)
        const r2 = CusMath.getPrecision(arg2)
        const m = Math.pow(10, Math.max(r1, r2))
        const n = Math.max(r1, r2)
        const mVal = (CusMath.convertNumber(arg1) * m - CusMath.convertNumber(arg2) * m) / m || 0
        const val = mVal ? Number(mVal.toPrecision(CusMath._precision)) : 0
        return Number(val.toFixed(n))
    }

    static accMul(arg1, arg2) {
        const n1 = CusMath.convertNumber(arg1)
        const n2 = CusMath.convertNumber(arg2)
        const p1 = CusMath.getPrecision(n1)
        const p2 = CusMath.getPrecision(n2)
        const i1 = Math.round(n1 * Math.pow(10, p1))
        const i2 = Math.round(n2 * Math.pow(10, p2))
        const raw = (i1 * i2) / Math.pow(10, p1 + p2)
        return raw ? Number(raw.toPrecision(CusMath._precision)) : 0
    }

    static accDiv(arg1, arg2) {
        const n1 = CusMath.convertNumber(arg1)
        const n2 = CusMath.convertNumber(arg2)
        const t1 = CusMath.getPrecision(n1)
        const t2 = CusMath.getPrecision(n2)
        const r1 = Math.round(n1 * Math.pow(10, t1))
        const r2 = Math.round(n2 * Math.pow(10, t2))
        return CusMath.accMul(r1 / r2, Math.pow(10, t2 - t1))
    }

    static getPrecision(val) {
        const num = CusMath.convertNumber(val)
        if (!Number.isFinite(num)) return 0
        let str = num.toString()
        if (/e/i.test(str)) str = num.toFixed(20).replace(/\.?0+$/, '')
        const dot = str.indexOf('.')
        return dot === -1 ? 0 : str.length - dot - 1
    }

    static convertNumber(num) {
        const val = Number(num)
        return Number.isNaN(val) ? 0 : val
    }

    convertNumber(num) {
        return CusMath.convertNumber(num)
    }

    isPercentage(str) {
        return /^(\-|\+)?\d+(\.\d+)?%$/.test(str)
    }

    convertPercentageToNum(str) {
        if (!this.isPercentage(str)) return 0
        return this.numberRoundUp(this.convertNumber(str.replace('%', '')) / 100)
    }

    convertNumToPercentage(str, number = 2) {
        if (!str || !/^(\-|\+)?\d+(\.\d+)?$/.test(String(str))) return '0%'
        return `${this.numberRoundUp(this.convertNumber(str) * 100).toFixed(number)}%`
    }

    numberRoundUp(num, accuracy = 3, type = 'round') {
        const numVal = this.convertNumber(num)
        if (!numVal) return 0
        const accuracyVal = Math.pow(10, this.convertNumber(accuracy))
        const newVal = CusMath.accMul(numVal, accuracyVal)
        if (type === 'roundUp') return Math.ceil(newVal) / accuracyVal
        if (type === 'roundDown') return Math.floor(newVal) / accuracyVal
        return Math.round(newVal) / accuracyVal
    }

    isNotEmptyArr(arr) {
        return Array.isArray(arr) && arr.length > 0
    }

    isOddNumber(num) {
        return num % 2 === 1
    }

    isNumber(str) {
        if (str === '' || str == null || typeof str === 'boolean') return false
        return !Number.isNaN(Number(str))
    }
}

export const cusMath = new CusMath()
