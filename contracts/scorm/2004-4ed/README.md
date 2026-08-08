# SCORM 2004 4th Edition schemas

The packager emits `imsmanifest.xml` referencing the ADL conformance
schemas. The vendored XSDs (placeholder URLs) live here:

- `imscp_v1p1.xsd` — IMS Content Packaging v1.1
- `imsss_v1p0.xsd` — IMS Simple Sequencing v1.0
- `adlcp_v1p3.xsd` — ADL SCORM Content Packaging v1.3 (4th Ed)

In production these XSDs are fetched from `imscp_v1p1.xsd`,
`imsss_v1p0.xsd`, `adlcp_v1p3.xsd` URLs at the IMS/ADL sites. We
vendor the manifest itself rather than the full XSD set because:

1. The packager emits a fixed-shape manifest — no runtime validation
   against XSD is needed; the LMS validates at import time.
2. Vendoring the full XSD set adds ~600 KB of XML.
3. The conformance contract is checked via `imsmanifest.xml` <-> LMS
   parity tests in `tools/conformance/scorm/`.

If a downstream LMS requires local XSDs, populate this directory from
https://www.imsglobal.org/ and update the `xsi:schemaLocation` URLs in
`workers/scorm-packager/src/index.ts`.
