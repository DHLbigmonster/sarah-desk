#!/usr/bin/env swift

import Foundation
import Speech

let semaphore = DispatchSemaphore(value: 0)
var finalText: String?

func finish(_ text: String) {
    finalText = text
    semaphore.signal()
}

// Read all PCM data from stdin (16-bit, 16kHz, mono)
let inputData = FileHandle.standardInput.readDataToEndOfFile()

guard !inputData.isEmpty else {
    let result = ["text": "", "isFinal": true, "backend": "apple-speech"] as [String: Any]
    if let jsonData = try? JSONSerialization.data(withJSONObject: result),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        FileHandle.standardOutput.write(Data((jsonString + "\n").utf8))
    }
    exit(0)
}

// Write PCM to a temp WAV file
let tempDir = FileManager.default.temporaryDirectory
let tempURL = tempDir.appendingPathComponent("sarah-apple-speech-\(UUID().uuidString).wav")

func writeWavFile(data: Data, url: URL, sampleRate: Int, channels: Int, bitsPerSample: Int) throws {
    let byteRate = sampleRate * channels * bitsPerSample / 8
    let blockAlign = channels * bitsPerSample / 8
    let dataSize = data.count
    let fileSize = 36 + dataSize

    var header = Data()
    // RIFF header
    header.append(contentsOf: "RIFF".utf8)
    header.append(contentsOf: withUnsafeBytes(of: UInt32(fileSize).littleEndian) { Data($0) })
    header.append(contentsOf: "WAVE".utf8)
    // fmt chunk
    header.append(contentsOf: "fmt ".utf8)
    header.append(contentsOf: withUnsafeBytes(of: UInt32(16).littleEndian) { Data($0) }) // chunk size
    header.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) }) // PCM format
    header.append(contentsOf: withUnsafeBytes(of: UInt16(channels).littleEndian) { Data($0) })
    header.append(contentsOf: withUnsafeBytes(of: UInt32(sampleRate).littleEndian) { Data($0) })
    header.append(contentsOf: withUnsafeBytes(of: UInt32(byteRate).littleEndian) { Data($0) })
    header.append(contentsOf: withUnsafeBytes(of: UInt16(blockAlign).littleEndian) { Data($0) })
    header.append(contentsOf: withUnsafeBytes(of: UInt16(bitsPerSample).littleEndian) { Data($0) })
    // data chunk
    header.append(contentsOf: "data".utf8)
    header.append(contentsOf: withUnsafeBytes(of: UInt32(dataSize).littleEndian) { Data($0) })

    var fileData = header
    fileData.append(data)
    try fileData.write(to: url)
}

do {
    try writeWavFile(data: inputData, url: tempURL, sampleRate: 16000, channels: 1, bitsPerSample: 16)
} catch {
    let result = ["text": "", "isFinal": true, "backend": "apple-speech", "error": "Failed to write temp WAV: \(error.localizedDescription)"] as [String: Any]
    if let jsonData = try? JSONSerialization.data(withJSONObject: result),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        FileHandle.standardOutput.write(Data((jsonString + "\n").utf8))
    }
    exit(1)
}

// Request speech recognition authorization
SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized else {
        let result = ["text": "", "isFinal": true, "backend": "apple-speech", "error": "Speech recognition not authorized (status: \(status.rawValue))"] as [String: Any]
        if let jsonData = try? JSONSerialization.data(withJSONObject: result),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            FileHandle.standardOutput.write(Data((jsonString + "\n").utf8))
        }
        // Clean up temp file
        try? FileManager.default.removeItem(at: tempURL)
        exit(1)
    }

    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-Hans"))
    guard let recognizer = recognizer, recognizer.isAvailable else {
        let result = ["text": "", "isFinal": true, "backend": "apple-speech", "error": "Speech recognizer not available"] as [String: Any]
        if let jsonData = try? JSONSerialization.data(withJSONObject: result),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            FileHandle.standardOutput.write(Data((jsonString + "\n").utf8))
        }
        try? FileManager.default.removeItem(at: tempURL)
        exit(1)
    }

    let request = SFSpeechURLRecognitionRequest(url: tempURL)
    request.shouldReportPartialResults = false

    var hasFinished = false

    let task = recognizer.recognitionTask(with: request) { result, error in
        guard !hasFinished else { return }

        if let error = error {
            hasFinished = true
            let output = ["text": "", "isFinal": true, "backend": "apple-speech", "error": error.localizedDescription] as [String: Any]
            if let jsonData = try? JSONSerialization.data(withJSONObject: output),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                FileHandle.standardOutput.write(Data((jsonString + "\n").utf8))
            }
            try? FileManager.default.removeItem(at: tempURL)
            finish("")
        } else if let result = result, result.isFinal {
            hasFinished = true
            let text = result.bestTranscription.formattedString
            let output = ["text": text, "isFinal": true, "backend": "apple-speech"] as [String: Any]
            if let jsonData = try? JSONSerialization.data(withJSONObject: output),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                FileHandle.standardOutput.write(Data((jsonString + "\n").utf8))
            }
            try? FileManager.default.removeItem(at: tempURL)
            finish(text)
        }
    }

    // Timeout after 15 seconds
    DispatchQueue.global().asyncAfter(deadline: .now() + 15) {
        guard !hasFinished else { return }
        hasFinished = true
        task.cancel()
        let result = ["text": "", "isFinal": true, "backend": "apple-speech", "error": "Recognition timed out"] as [String: Any]
        if let jsonData = try? JSONSerialization.data(withJSONObject: result),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            FileHandle.standardOutput.write(Data((jsonString + "\n").utf8))
        }
        try? FileManager.default.removeItem(at: tempURL)
        finish("")
    }
}

semaphore.wait()
