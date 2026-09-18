;; VTable demo data engine — metrics, aggregation, dict index, CSV number helpers
(module
  (memory (export "memory") 32)

  (func $seedInt (export "seedInt") (param $row i32) (param $col i32) (result i32)
    (i32.rem_u
      (i32.add
        (i32.add
          (i32.mul (local.get $row) (i32.const 9301))
          (i32.mul (local.get $col) (i32.const 49297))
        )
        (i32.const 233)
      )
      (i32.const 233280)
    )
  )

  (func $metric (export "metric") (param $row i32) (param $col i32) (result f64)
    (local $x i32)
    (local.set $x (call $seedInt (local.get $row) (local.get $col)))
    (f64.div
      (f64.nearest
        (f64.mul
          (f64.div
            (f64.convert_i32_u (local.get $x))
            (f64.const 233280)
          )
          (f64.const 100000)
        )
      )
      (f64.const 100)
    )
  )

  ;; dictIndex(row, col, mod) -> i32
  (func (export "dictIndex") (param $row i32) (param $col i32) (param $mod i32) (result i32)
    (i32.rem_u
      (call $seedInt (local.get $row) (local.get $col))
      (local.get $mod)
    )
  )

  ;; columnKind(col) -> 0..3
  (func (export "columnKind") (param $col i32) (result i32)
    (i32.rem_u (local.get $col) (i32.const 4))
  )

  (func $sumMetricColumn (export "sumMetricColumn") (param $rows i32) (param $col i32) (result f64)
    (local $i i32)
    (local $s f64)
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $rows)))
        ;; only meaningful for numeric columns; caller filters
        (local.set $s
          (f64.add
            (local.get $s)
            (call $metric (local.get $i) (local.get $col))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    (local.get $s)
  )

  (func (export "sumAllMetrics") (param $rows i32) (param $cols i32) (param $outPtr i32)
    (local $c i32)
    (local $sum f64)
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $c) (local.get $cols)))
        (local.set $sum (call $sumMetricColumn (local.get $rows) (local.get $c)))
        (f64.store
          (i32.add
            (local.get $outPtr)
            (i32.mul (local.get $c) (i32.const 8))
          )
          (local.get $sum)
        )
        (local.set $c (i32.add (local.get $c) (i32.const 1)))
        (br $loop)
      )
    )
  )

  (func (export "fillStatus") (param $rows i32) (param $outPtr i32)
    (local $i i32)
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $rows)))
        (i32.store8
          (i32.add (local.get $outPtr) (local.get $i))
          (i32.rem_u (local.get $i) (i32.const 4))
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )

  ;; matchAscii(hayPtr, hayLen, needlePtr, needleLen) -> 1/0  (lowercase ASCII only)
  (func (export "matchAscii") (param $hayPtr i32) (param $hayLen i32) (param $needlePtr i32) (param $needleLen i32) (result i32)
    (local $i i32)
    (local $j i32)
    (local $ok i32)
    (local $hc i32)
    (local $nc i32)
    (if (i32.eqz (local.get $needleLen)) (then (return (i32.const 1))))
    (if (i32.lt_u (local.get $hayLen) (local.get $needleLen)) (then (return (i32.const 0))))
    (block $outerBreak
      (loop $outer
        (br_if $outerBreak (i32.gt_u (i32.add (local.get $i) (local.get $needleLen)) (local.get $hayLen)))
        (local.set $j (i32.const 0))
        (local.set $ok (i32.const 1))
        (block $innerBreak
          (loop $inner
            (br_if $innerBreak (i32.ge_u (local.get $j) (local.get $needleLen)))
            (local.set $hc (i32.load8_u (i32.add (local.get $hayPtr) (i32.add (local.get $i) (local.get $j)))))
            (local.set $nc (i32.load8_u (i32.add (local.get $needlePtr) (local.get $j))))
            ;; tolower A-Z
            (if (i32.and (i32.ge_u (local.get $hc) (i32.const 65)) (i32.le_u (local.get $hc) (i32.const 90)))
              (then (local.set $hc (i32.add (local.get $hc) (i32.const 32))))
            )
            (if (i32.and (i32.ge_u (local.get $nc) (i32.const 65)) (i32.le_u (local.get $nc) (i32.const 90)))
              (then (local.set $nc (i32.add (local.get $nc) (i32.const 32))))
            )
            (if (i32.ne (local.get $hc) (local.get $nc))
              (then
                (local.set $ok (i32.const 0))
                (br $innerBreak)
              )
            )
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $inner)
          )
        )
        (if (local.get $ok) (then (return (i32.const 1))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer)
      )
    )
    (i32.const 0)
  )
)
