import Foundation
import Metal

var running = true

signal(SIGINT) { _ in running = false }
signal(SIGTERM) { _ in running = false }

guard let device = MTLCreateSystemDefaultDevice(),
      let queue = device.makeCommandQueue()
else {
    fputs("Metal GPU unavailable\n", stderr)
    exit(1)
}

let source = """
#include <metal_stdlib>
using namespace metal;
kernel void stress(device float *out [[buffer(0)]],
                   uint id [[thread_position_in_grid]]) {
    float x = float(id) + 1.0;
    for (int i = 0; i < 50000; i++) {
        x = sin(x) * cos(x) + sqrt(x + 1.0);
    }
    out[id % 4096] = x;
}
"""

let library: MTLLibrary
do {
    library = try device.makeLibrary(source: source, options: nil)
} catch {
    fputs("Failed to compile Metal shader: \(error)\n", stderr)
    exit(1)
}

guard let function = library.makeFunction(name: "stress"),
      let pipeline = try? device.makeComputePipelineState(function: function)
else {
    fputs("Failed to create compute pipeline\n", stderr)
    exit(1)
}

let bufferLength = 4096 * MemoryLayout<Float>.stride
guard let buffer = device.makeBuffer(length: bufferLength, options: .storageModeShared)
else {
    fputs("Failed to allocate GPU buffer\n", stderr)
    exit(1)
}

let threadsPerGroup = MTLSize(
    width: min(pipeline.maxTotalThreadsPerThreadgroup, 256),
    height: 1,
    depth: 1
)
let threadgroups = MTLSize(width: 64, height: 1, depth: 1)

fputs("GPU stress running on \(device.name)\n", stderr)

while running {
    autoreleasepool {
        guard running,
              let commandBuffer = queue.makeCommandBuffer(),
              let encoder = commandBuffer.makeComputeCommandEncoder()
        else { return }

        encoder.setComputePipelineState(pipeline)
        encoder.setBuffer(buffer, offset: 0, index: 0)
        encoder.dispatchThreadgroups(threadgroups, threadsPerThreadgroup: threadsPerGroup)
        encoder.endEncoding()
        commandBuffer.commit()
        commandBuffer.waitUntilCompleted()
    }
}