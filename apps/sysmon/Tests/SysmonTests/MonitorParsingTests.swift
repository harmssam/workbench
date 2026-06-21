import Testing
@testable import Sysmon

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
}