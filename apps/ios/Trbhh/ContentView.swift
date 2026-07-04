import SwiftUI

/// يفتح الموقع بمعرّف نسخة التطبيق (?app=ios&v=2) ليعمل التحديث الإجباري:
/// رفع «أدنى نسخة آيفون» في إعدادات إدارة تربح يحجب النسخ الأقدم بشاشة تحديث.
let startURL = URL(string: "https://trbhh.com/?app=ios&v=2")!

struct ContentView: View {
    var body: some View {
        WebView(url: startURL)
            .ignoresSafeArea(edges: .bottom)
            .background(Color(red: 0x32 / 255, green: 0x87 / 255, blue: 0xda / 255))
    }
}
