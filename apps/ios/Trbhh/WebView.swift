import SwiftUI
@preconcurrency import WebKit

/// غلاف WKWebView لموقع تربح:
/// - روابط trbhh.com تبقى داخل التطبيق، وأي رابط خارجي يُفتح في سفاري/التطبيق المناسب
///   (tel: و mailto: و whatsapp: تعمل مباشرة).
/// - سحب للأسفل = تحديث الصفحة، وإيماءات الرجوع/التقدم مفعّلة.
struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.refreshControl = context.coordinator.makeRefreshControl(for: webView)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private static func isInternal(_ url: URL) -> Bool {
            guard let host = url.host?.lowercased() else { return false }
            return host == "trbhh.com" || host == "www.trbhh.com" || host.hasSuffix(".trbhh.com")
        }

        func makeRefreshControl(for webView: WKWebView) -> UIRefreshControl {
            let control = UIRefreshControl()
            control.addAction(UIAction { [weak webView, weak control] _ in
                webView?.reload()
                control?.endRefreshing()
            }, for: .valueChanged)
            return control
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "http" || scheme == "https" {
                if Self.isInternal(url) {
                    decisionHandler(.allow)
                } else {
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                }
                return
            }
            if scheme == "about" || scheme == "blob" || scheme == "data" {
                decisionHandler(.allow)
                return
            }
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            if Self.isInternal(url) {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url)
            }
            return nil
        }
    }
}
