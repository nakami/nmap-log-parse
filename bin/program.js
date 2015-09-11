var MacAddress = (function () {
    function MacAddress(addr, vendor) {
        this.addr = addr;
        this.vendor = vendor;
    }
    return MacAddress;
})();
var HostInfo = (function () {
    function HostInfo(mac) {
        this.mac = mac;
        this.times = [];
        this.hostnames = {};
        this.ips = {};
    }
    ;
    return HostInfo;
})();
var config;
function roundDate(date, hours) {
    date = new Date(date.toString());
    date.setHours(date.getHours() - date.getHours() % hours);
    date.setMinutes(0, 0, 0);
    return date;
}
function mapToGlobal(date) {
    return roundDate(date, 3);
}
function mapToSingleDate(date) {
    date = roundDate(date, 1);
    date.setFullYear(1970);
    date.setMonth(0, 1);
    return date;
}
function mapToWeek(date) {
    date = roundDate(date, 3);
    date.setFullYear(1970);
    date.setMonth(0, date.getDay() + 5);
    return date;
}
var charts = [
    { container: '#globalChart', title: "Uptime percentage by date", mapper: mapToGlobal },
    { container: "#dailyChart", title: "Uptime percentage by day time", mapper: mapToSingleDate },
    { container: "#weeklyChart", title: "Uptime percentage by week day", mapper: mapToWeek,
        config: { xAxis: { labels: { formatter: function () { return "" + "Su,Mo,Tu,We,Th,Fr,Sa,Su".split(",")[new Date(this.value).getDay()]; } } } }
    },
];
var Parser;
(function (Parser) {
    function parse(hosts, nmapRun) {
        var time = new Date(1000 * +nmapRun.getAttribute("start"));
        if (time < new Date(2000, 0))
            return;
        for (var i = 0; i < nmapRun.children.length; i++) {
            var h = nmapRun.children[i];
            if (h.nodeName !== 'host')
                continue;
            var mac = '', vendor = '', ip = '', hostname = '';
            for (var j = 0; j < h.children.length; j++) {
                var a = h.children[j];
                if (a instanceof Element) {
                    if (a.nodeName === 'address') {
                        var type = a.getAttribute("addrtype");
                        if (type === 'mac') {
                            mac = a.getAttribute("addr");
                            vendor = a.getAttribute("vendor");
                        }
                        else if (type === 'ipv4') {
                            ip = a.getAttribute("addr");
                        }
                    }
                    else if (a.nodeName === 'hostnames') {
                        if (a.children.length > 0)
                            hostname = a.children[0].getAttribute("name");
                    }
                }
            }
            hosts[mac] = hosts[mac] || new HostInfo(new MacAddress(mac, vendor));
            var lastTime = hosts[mac].times[hosts[mac].times.length - 1];
            if (lastTime !== time)
                hosts[mac].times.push(time);
            hosts[mac].ips[ip] = hosts[mac].ips[ip] + 1 || 1;
            hosts[mac].hostnames[hostname] = hosts[mac].hostnames[hostname] + 1 || 1;
        }
    }
    function parseAll(list) {
        var hosts = {};
        var parser = new DOMParser();
        list.split("<?xml version").filter(function (doc) { return doc.length > 0; })
            .forEach(function (doc) { return parse(hosts, parser.parseFromString("<?xml version" + doc, "text/xml").documentElement); });
        return hosts;
    }
    Parser.parseAll = parseAll;
})(Parser || (Parser = {}));
function getname(host) {
    var names = Object.keys(host.hostnames);
    var explicitName = config.macToName[host.mac.addr]
        || names.map(function (h) { return config.hostToName[h]; }).filter(function (name) { return !!name; })[0];
    if (explicitName)
        return explicitName;
    if (names[0] && names[0].indexOf("android") == 0 && host.mac.vendor)
        return "Android von " + host.mac.vendor.split(" ").slice(0, 2).join(" ");
    return names[0] || host.mac.addr;
}
function totable(data) {
    var table = $("<table class='table'>");
    var atts = Object.keys(data[0]);
    table.append(atts.map(function (att) { return $("<th>").text(att); }));
    table.append(data.map(function (row) { return atts.map(function (att) { return row[att]; }); })
        .map(function (row) { return $("<tr>").append(row.map(function (val) { return $("<td>").text(val); })); }));
    return table;
}
function getTable(hosts) {
    return totable(Object.keys(hosts).map(function (mac) { return hosts[mac]; })
        .sort(function (a, b) { return b.times.length - a.times.length; })
        .map(function (host) {
        return ({
            Name: getname(host),
            Mac: host.mac.addr,
            Hostnames: Object.keys(host.hostnames).join(", "),
            IPs: Object.keys(host.ips).join(", "),
            Uptime: (host.times.length / 6).toFixed(1) + " hours"
        });
    }));
}
function getChart(self, title, hosts, mapDate, configChanges) {
    if (configChanges === void 0) { configChanges = {}; }
    var allPoints = [];
    var filteredHosts = Object.keys(hosts).map(function (h) { return hosts[h]; }).filter(function (h) {
        return h.times.length * config.logInterval > config.ignoreLessThan;
    });
    filteredHosts.forEach(function (h) { return h.times.map(function (time) { return allPoints.push({ host: h, time: time }); }); });
    var lookup = {};
    filteredHosts.forEach(function (h, i) { return lookup[h.mac.addr] = i; });
    var bins = {};
    for (var _i = 0; _i < allPoints.length; _i++) {
        var point = allPoints[_i];
        var x = mapDate(point.time).getTime();
        var mac = point.host.mac.addr;
        if (!bins[x])
            bins[x] = {};
        bins[x][mac] = bins[x][mac] + 1 || 1;
    }
    var series = filteredHosts.map(function (h) { return ({
        name: getname(h),
        data: Object.keys(bins).map(function (time) { return ({ x: +time, y: 100 * bins[time][h.mac.addr] / bins[time][self.mac.addr] || 0 }); }).sort(function (a, b) { return a.x - b.x; })
    }); });
    return $.extend(true, {
        chart: { type: 'line', zoomType: 'x' },
        title: { text: title },
        xAxis: {
            type: 'datetime',
        },
        plotOptions: { line: { marker: { enabled: false } } },
        yAxis: {
            title: { text: 'Online' },
            labels: { format: "{value:%.0f}%" },
            min: 0
        },
        // tooltip: {},
        series: series
    }, configChanges);
}
function display(hosts) {
    window.hosts = hosts;
    $("body>div").append("<h3>Totals</h3>");
    $("body>div").append(getTable(hosts));
    var selfHost = Object.keys(hosts).map(function (h) { return hosts[h]; }).filter(function (h) { return Object.keys(h.hostnames)[0] === config.self; })[0];
    for (var _i = 0; _i < charts.length; _i++) {
        var chart = charts[_i];
        $(chart.container).highcharts(getChart(selfHost, chart.title, hosts, chart.mapper, chart.config));
    }
    //$("#weeklyChart").highcharts(getChart(selfHost, "Uptime percentage by day time", hosts, weeklyMapper));
}
Highcharts.setOptions({ global: { useUTC: false } });
$.getJSON("config.json").then(function (_config) {
    config = _config;
    $.get(config.input).then(Parser.parseAll).then(function (hosts) { return display(hosts); });
}).fail(function (x) { return console.error(x); });
//# sourceMappingURL=program.js.map