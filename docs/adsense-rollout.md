# AdSense: verification-only rollout

Publisher: ca-pub-9630412836616941. Base: main at 4354129f3f9ce935ef418d402cf2964e90836469.

This rollout adds the AdSense account meta tag to the SSR document head and an authorized seller entry at /ads.txt. It deliberately does not load adsbygoogle.js, enable Auto ads, add ad placements, or change account consent settings. It does not enable monetization by itself.

Before requesting verification, confirm the public production homepage HTML contains the exact meta tag and /ads.txt returns HTTP 200 with the exact plain-text seller record, not an HTML fallback. Then select the matching verification method in AdSense. Do not report approval until Google completes its site review.

Advertising remains blocked pending a reviewed consent implementation. No certified CMP or advertising consent UI was found in current main. Google's requirements mandate a Google-certified CMP integrated with the IAB TCF for personalized ads in the EEA, UK and Switzerland. Non-personalized/limited ads have their own consent and policy requirements and must not be treated as a blanket exemption. Privacy disclosures, reject/manage options, withdrawal and behavior before consent need review before loading advertising code. Account settings and legal choices require separate approval.

Official sources:
- https://support.google.com/adsense/answer/7584263?hl=en
- https://support.google.com/adsense/answer/12171612?hl=en
- https://support.google.com/adsense/answer/13554116?hl=en

The Plus draft branch and PR4 are unrelated and must not be merged for this rollout. No production configuration, Supabase or Paddle changes are needed.
