import CoreLocation

@MainActor
final class LocationController: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
  @Published var location: CLLocation?
  @Published var denied = false
  private let manager = CLLocationManager()
  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
  }
  func request() {
    manager.requestWhenInUseAuthorization()
    manager.requestLocation()
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    location = locations.last
  }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    denied = true
  }
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    denied = manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted
  }
}
