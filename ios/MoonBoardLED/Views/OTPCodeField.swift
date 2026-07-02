import SwiftUI

/// A segmented one-time-code input: N boxes, one digit each (like the App Store's).
///
/// Under the hood it's a *single* hidden `TextField` that owns the whole string and
/// carries `.textContentType(.oneTimeCode)`, with the boxes drawn on top as a read-only
/// overlay. This is deliberate — one backing field preserves iOS's code AutoFill and the
/// "Paste" QuickType suggestion; six separate fields would break both.
struct OTPCodeField: View {
    @Binding var code: String
    var length: Int = 6
    /// Called once when the field first fills to `length` digits (for auto-submit).
    var onComplete: () -> Void = {}

    @FocusState private var focused: Bool

    var body: some View {
        // The real, interactive field — invisible text/caret so only the boxes show.
        TextField("", text: $code)
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
            .focused($focused)
            .foregroundStyle(.clear)
            .tint(.clear)
            .frame(height: 56)
            .overlay {
                boxes.allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
            .onChange(of: code) { _, newValue in
                let cleaned = String(newValue.filter { $0.isNumber }.prefix(length))
                if cleaned != code { code = cleaned }
                if cleaned.count == length { onComplete() }
            }
            .onAppear { focused = true }
    }

    private var boxes: some View {
        let digits = Array(code)
        return HStack(spacing: 10) {
            ForEach(0..<length, id: \.self) { index in
                let isActive = focused && index == digits.count
                Text(index < digits.count ? String(digits[index]) : "")
                    .font(.title.monospacedDigit())
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color(.secondarySystemBackground))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(isActive ? Color.accentColor : Color(.separator),
                                    lineWidth: isActive ? 2 : 1)
                    )
            }
        }
    }
}
