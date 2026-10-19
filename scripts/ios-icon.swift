import AppKit

// An opaque 1024px source icon; iOS applies the corner mask itself.
let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(red: 0.012, green: 0.027, blue: 0.071, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()
let globe = NSBezierPath(ovalIn: NSRect(x: 170, y: 170, width: 684, height: 684))
NSColor(red: 0.03, green: 0.42, blue: 0.66, alpha: 1).setFill()
globe.fill()
NSGraphicsContext.saveGraphicsState()
globe.addClip()
NSColor(red: 0.02, green: 0.09, blue: 0.20, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 365, y: 80, width: 640, height: 860)).fill()
NSColor(red: 0.3, green: 0.8, blue: 0.9, alpha: 0.8).setStroke()
for width in [220.0, 480.0] {
    let meridian = NSBezierPath(ovalIn: NSRect(x: 512-width/2, y: 170, width: width, height: 684))
    meridian.lineWidth = 8; meridian.stroke()
}
for y in [360.0, 520.0, 680.0] {
    let parallel = NSBezierPath(ovalIn: NSRect(x: 130, y: y-65, width: 764, height: 130))
    parallel.lineWidth = 8; parallel.stroke()
}
NSGraphicsContext.restoreGraphicsState()
NSColor(red: 0.98, green: 0.73, blue: 0.14, alpha: 1).setStroke()
globe.lineWidth = 12; globe.stroke()
NSColor(red: 0.98, green: 0.73, blue: 0.14, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 120, y: 700, width: 160, height: 160)).fill()
NSGraphicsContext.restoreGraphicsState()
let data = bitmap.representation(using: .png, properties: [:])!
try data.write(to: URL(fileURLWithPath: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"))
