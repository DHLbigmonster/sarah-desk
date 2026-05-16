#!/usr/bin/env swift

import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count >= 2 else {
  fputs("Usage: ocr-image.swift <image-path>\n", stderr)
  exit(2)
}

let imagePath = CommandLine.arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: imageURL),
      let tiffData = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
  fputs("Failed to load image: \(imagePath)\n", stderr)
  exit(3)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
  try handler.perform([request])
  let lines = (request.results ?? [])
    .compactMap { observation in observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
    .filter { !$0.isEmpty }
  print(lines.joined(separator: "\n"))
} catch {
  fputs("OCR failed: \(error.localizedDescription)\n", stderr)
  exit(4)
}
