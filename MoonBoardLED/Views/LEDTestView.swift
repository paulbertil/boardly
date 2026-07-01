import SwiftUI

/// Calibration screen: step an LED along the strip and confirm it lights the hold
/// the app expects. If the physical board lights the opposite hold, flip the
/// orientation. This validates the serpentine mapping against the real wiring.
struct LEDTestView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var ble: MoonBoardBLEManager
    @AppStorage("boardOrientationFlipped") private var flipped = false

    @State private var ledIndex = 0

    private var expected: (col: Int, row: Int)? {
        BoardGeometry.position(forLED: ledIndex, flipped: flipped)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("LED \(ledIndex) of \(BoardGeometry.totalLEDs - 1)")
                    .font(.title2.weight(.semibold))

                if let p = expected {
                    Text("Expected hold: \(BoardGeometry.columnLabel(p.col))\(p.row)")
                        .foregroundStyle(.secondary)
                }

                BoardImageView(setup: .mini2025, highlight: expected)
                    .frame(maxHeight: 360)
                    .padding(.horizontal, 8)

                Stepper("LED index: \(ledIndex)", value: $ledIndex,
                        in: 0...(BoardGeometry.totalLEDs - 1))
                    .onChange(of: ledIndex) { _, new in ble.lightSingleLED(new) }
                    .padding(.horizontal)

                Toggle("Board wired from opposite end (flip)", isOn: $flipped)
                    .onChange(of: flipped) { _, _ in ble.lightSingleLED(ledIndex) }
                    .padding(.horizontal)

                if !ble.isConnected {
                    Text("Connect to the board first to see the LEDs.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(.top)
            .navigationTitle("LED Test")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { ble.clear(); dismiss() }
                }
            }
            .onAppear { if ble.isConnected { ble.lightSingleLED(ledIndex) } }
        }
    }
}
