import Foundation

/// Geometry and LED mapping for the Mini MoonBoard 2025 (11 columns A–K × 12 rows).
///
/// The ArduinoMoonBoardLED firmware maps a hold's number 1:1 to a physical LED on
/// the strip (`ledmapping` is the identity for the Mini). The strip is wired in a
/// serpentine: LED 0 is the bottom of column A, counting up column A; the strip
/// then snakes down column B, up column C, and so on. We reproduce that here so the
/// number we send in `S<n>/P<n>/E<n>` lands on the right physical hold.
///
/// Derived/confirmed from the firmware's `additionalledmapping` array, whose
/// period-12 groups with alternating +1/−1 direction prove 12 LEDs per column with
/// alternating (serpentine) wiring direction.
enum BoardGeometry {
    static let columns = 11          // A...K
    static let rows = 12             // 1 (bottom) ... 12 (top)
    static let totalLEDs = columns * rows  // 132

    static let columnLabels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]

    /// LED index (0-based) for a hold at the given column/row.
    /// - Parameters:
    ///   - col: 0...10 (A...K, left → right)
    ///   - row: 1...12 (1 = bottom)
    ///   - flipped: if the user's board is wired/mounted from the opposite end,
    ///     this reverses the whole strip order. Toggle it in the LED test screen.
    static func ledIndex(col: Int, row: Int, flipped: Bool = false) -> Int {
        let base = col * rows
        let led: Int
        if col % 2 == 0 {
            // Even columns (A, C, E, G, I, K): bottom → top
            led = base + (row - 1)
        } else {
            // Odd columns (B, D, F, H, J): top → bottom
            led = base + (rows - row)
        }
        return flipped ? (totalLEDs - 1 - led) : led
    }

    /// Reverse mapping: which (col, row) does a given LED index correspond to.
    /// Used by the LED test screen to highlight the hold a stepped LED lights.
    static func position(forLED led: Int, flipped: Bool = false) -> (col: Int, row: Int)? {
        guard led >= 0 && led < totalLEDs else { return nil }
        let effective = flipped ? (totalLEDs - 1 - led) : led
        let col = effective / rows
        let offset = effective % rows
        let row = (col % 2 == 0) ? (offset + 1) : (rows - offset)
        return (col, row)
    }

    static func columnLabel(_ col: Int) -> String {
        guard col >= 0 && col < columnLabels.count else { return "?" }
        return columnLabels[col]
    }

    // Board-art layout (image aspect + hold-center placement) now lives in
    // `MoonBoardGeometry`, which `BoardImageView` uses for every setup. This enum
    // is only the LED serpentine mapping the firmware needs.
}
