#!/usr/bin/env python3
"""Generates rules/ads.json and rules/trackers.json (declarativeNetRequest format).

Edit the lists below and re-run:  python3 tools/build_rules.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

AD_DOMAINS = """
doubleclick.net googlesyndication.com googleadservices.com adservice.google.com
googletagservices.com adnxs.com adsrvr.org advertising.com criteo.com criteo.net
taboola.com outbrain.com amazon-adsystem.com pubmatic.com rubiconproject.com
openx.net casalemedia.com indexww.com smartadserver.com adform.net yieldmo.com
sharethrough.com triplelift.com 3lift.com media.net contextweb.com bidswitch.net
spotxchange.com spotx.tv teads.tv moatads.com adsafeprotected.com doubleverify.com
serving-sys.com flashtalking.com zedo.com revcontent.com mgid.com propellerads.com
popads.net popcash.net adcash.com exoclick.com juicyads.com trafficjunky.net
adroll.com adition.com smaato.net inmobi.com adcolony.com chartboost.com
ads.yahoo.com an.facebook.com lijit.com sovrn.com gumgum.com kargo.com
undertone.com districtm.io emxdgt.com onetag-sys.com 33across.com sonobi.com
yieldlab.net improvedigital.com adhese.com admixer.net adtelligent.com aniview.com
connatix.com primis.tech vidazoo.com zemanta.com adzerk.net ads-twitter.com
static.ads-twitter.com ads.linkedin.com adsterra.com hilltopads.net clickadu.com
popmyads.com ad.plus adskeeper.com richaudience.com seedtag.com unrulymedia.com
""".split()

AD_URL_FILTERS = [
    "||youtube.com/pagead/",
    "||youtube.com/api/stats/ads",
    "||youtube.com/get_midroll_",
    "||google.com/pagead/",
    "||google.com/adsense/",
    "/pagead/js/adsbygoogle.js",
    "/prebid.js",
    "/prebid-",
]

TRACKER_DOMAINS = """
google-analytics.com analytics.google.com scorecardresearch.com quantserve.com
quantcount.com hotjar.com hotjar.io mouseflow.com fullstory.com crazyegg.com
clarity.ms mixpanel.com api.segment.io api.amplitude.com heapanalytics.com
chartbeat.com chartbeat.net nr-data.net bat.bing.com px.ads.linkedin.com
analytics.tiktok.com ct.pinterest.com omtrdc.net demdex.net everesttech.net
krxd.net bluekai.com exelator.com rlcdn.com tapad.com agkn.com crwdcntrl.net
mathtag.com eyeota.net id5-sync.com liadm.com mc.yandex.ru hm.baidu.com
pixel.wp.com stats.wp.com bounceexchange.com adsymptotic.com
""".split()

TRACKER_URL_FILTERS = [
    "||facebook.com/tr^",
    "||connect.facebook.net^*/fbevents.js",
    "||google.com/ads/ga-audiences",
    "/gtag/js?id=AW-",
]

SUBRESOURCES = {"excludedResourceTypes": ["main_frame"]}


def build(domains, url_filters):
    rules = [{
        "id": 1,
        "priority": 1,
        "action": {"type": "block"},
        "condition": {"requestDomains": sorted(set(domains)), **SUBRESOURCES},
    }]
    for i, f in enumerate(url_filters, start=2):
        rules.append({
            "id": i,
            "priority": 1,
            "action": {"type": "block"},
            "condition": {"urlFilter": f, **SUBRESOURCES},
        })
    return rules


def main():
    for name, domains, filters in [
        ("ads", AD_DOMAINS, AD_URL_FILTERS),
        ("trackers", TRACKER_DOMAINS, TRACKER_URL_FILTERS),
    ]:
        path = ROOT / "rules" / f"{name}.json"
        path.write_text(json.dumps(build(domains, filters), indent=2) + "\n")
        print(f"wrote {path.relative_to(ROOT)}: {len(domains)} domains, {len(filters)} URL filters")


if __name__ == "__main__":
    main()
