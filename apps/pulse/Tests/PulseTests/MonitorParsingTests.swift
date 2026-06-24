import Testing
@testable import Pulse

@Suite("Monitor parsing")
struct MonitorParsingTests {
    @Test("Parses netstat interface rows")
    func netstatParsing() async {
        let monitor = NetworkMonitor()
        let output = """
        Name       Mtu   Network       Address            Ipkts Ierrs    Ibytes    Opkts Oerrs     Obytes  Coll
        lo0        16384 <Link#1>      0:0:0:0:0:0:0:0        0     0         0        0     0          0     0
        en0        1500  <Link#11>     0:0:0:0:0:0:0:0     1000     0   1000000      500     0     500000     0
        """

        let stats = await monitor.parseNetstatOutput(output)
        let en0 = stats.first { $0.name == "en0" }

        #expect(en0?.bytesIn == 1_000_000)
        #expect(en0?.bytesOut == 500_000)
    }

    @Test("Parses nettop process rows")
    func nettopParsing() async {
        let monitor = NetworkMonitor()
        let output = """
        time,,interface,state,rx_dupe,rx_ooo,re-tx,rtt_avg,rcvsize,tx_win,tc_class,tc_mgt,cc_algo,P,C,R,W,arch
        Safari.123,1000,2000
        kernel_task.0,0,0
        """

        let stats = await monitor.parseNettopOutput(output)

        #expect(stats["Safari"]?.bytesIn == 1000)
        #expect(stats["Safari"]?.bytesOut == 2000)
        #expect(stats["Safari"]?.pid == 123)
        #expect(stats["kernel_task"] == nil)
    }

    @Test("Formats Mbps from bytes per second")
    func mbpsFormatting() {
        #expect(ByteFormatter.formatMbps(bytesPerSecond: 0) == "0.0")
        #expect(ByteFormatter.formatMbps(bytesPerSecond: 125_000) == "1.0")
        #expect(ByteFormatter.formatMbps(bytesPerSecond: 12_500_000) == "100")
    }

    @Test("Formats compact menu bar Mbps")
    func menuBarMbpsFormatting() {
        #expect(ByteFormatter.formatMenuBarMbps(bytesPerSecond: 0) == "0")
        #expect(ByteFormatter.formatMenuBarMbps(bytesPerSecond: 125_000) == "1.0")
        #expect(ByteFormatter.formatMenuBarMbps(bytesPerSecond: 1_250_000) == "10")
        #expect(ByteFormatter.formatMenuBarMbps(bytesPerSecond: 12_500_000) == "100")
    }

    @Test("Parses ioreg statistics dictionary lines")
    func ioregStatisticsParsing() async {
        let monitor = DiskMonitor()
        let line = """
        "Statistics" = {"Operations (Write)"=8123719,"Bytes (Read)"=472490442752,"Bytes (Write)"=191732469760,"Operations (Read)"=14754103}
        """

        let read = await monitor.parseStatisticValue(in: line, key: "Bytes (Read)")
        let write = await monitor.parseStatisticValue(in: line, key: "Bytes (Write)")

        #expect(read == 472_490_442_752)
        #expect(write == 191_732_469_760)
    }

    @Test("Temp monitor samples without crashing on Apple Silicon")
    func tempSampling() async {
        let monitor = TempMonitor()
        let snapshot = await monitor.sample()

        // On real hardware it may return values or .unavailable; just ensure no crash and sane bounds if present.
        if let cpu = snapshot.cpuTemperature {
            #expect(cpu > 15 && cpu < 140)
        }
        if let gpu = snapshot.gpuTemperature {
            #expect(gpu > 15 && gpu < 140)
        }
    }

    @Test("Fan monitor samples without crashing on Apple Silicon")
    func fanSampling() async {
        let monitor = FanMonitor()
        let snapshot = await monitor.sample()

        // Fans optional or idle; just validate structure if present.
        for fan in snapshot.fans {
            #expect(fan.currentRPM >= 0)
            if let minR = fan.minRPM, let maxR = fan.maxRPM {
                #expect(minR <= maxR)
            }
        }
    }
}