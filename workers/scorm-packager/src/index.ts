/**
 * @domio/scorm-packager — SCORM 2004 4th Ed packager.
 *
 * Phase 16 W9. Produces an `imsmanifest.xml` document referencing the
 * attendance + engagement artifacts, plus a `imsxml.xml` content body
 * and per-org launch URL. ADL conformance schemas are vendored under
 * `contracts/scorm/2004-4ed/`.
 *
 * The output is a structured object the handout-generator can write to
 * S3; we don't zip here (production wires a zip writer).
 */

export interface ScormInput {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly title: string;
  readonly duration_ms: number;
  readonly unique_participants: number;
  readonly attendance_chain_intact: boolean;
  readonly organization_id: string;
  readonly resource_id: string;
  readonly item_id: string;
  readonly launch_url: string;
  readonly session_id_at4ed?: string;
}

export interface ScormPackage {
  readonly imsmanifest: string;
  readonly imsxml: string;
  readonly resource_id: string;
  readonly organization_id: string;
  readonly item_id: string;
}

export class ScormPackager {
  build(input: ScormInput): ScormPackage {
    const organization_id = input.organization_id || `ORG-${input.workspace_id}-${input.session_id}`;
    const resource_id = input.resource_id || `RES-${input.session_id}`;
    const item_id = input.item_id || `ITEM-${input.session_id}`;
    const at4_id = input.session_id_at4ed ?? input.session_id;
    const imsmanifest = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<manifest identifier="' + escapeXml(organization_id) + '" version="1.0"',
      '          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"',
      '          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"',
      '          xmlns:imsss="http://www.imsglobal.org/xsd/imsss_v1p0"',
      '          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '          xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.imsglobal.org/xsd/imsss_v1p0 imsss_v1p0.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd">',
      '  <metadata>',
      '    <schema>ADL SCORM</schema>',
      '    <schemaversion>2004 4th Edition</schemaversion>',
      '    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">',
      '      <general><title><string language="en">' + escapeXml(input.title) + '</string></title></general>',
      '      <technical><format>text/html</format></technical>',
      '    </lom>',
      '  </metadata>',
      '  <organizations default="' + escapeXml(organization_id) + '">',
      '    <organization identifier="' + escapeXml(organization_id) + '" structure="hierarchical">',
      '      <item identifier="' + escapeXml(item_id) + '" identifierref="' + escapeXml(resource_id) + '" isvisible="true">',
      '        <title>' + escapeXml(input.title) + '</title>',
      '        <adlcp:completionStatus>completed</adlcp:completionStatus>',
      '        <imsss:tracking><imsss:tracked>true</imsss:tracked></imsss:tracking>',
      '      </item>',
      '    </organization>',
      '  </organizations>',
      '  <resources>',
      '    <resource identifier="' + escapeXml(resource_id) + '" type="webcontent" adlcp:scormType="sco" href="' + escapeXml(input.launch_url) + '">',
      '      <file href="' + escapeXml(input.launch_url) + '"/>',
      '      <metadata><adlcp:location>' + escapeXml(at4_id) + '</adlcp:location></metadata>',
      '    </resource>',
      '  </resources>',
      '</manifest>',
    ].join('\n');
    const imsxml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<session id="' + escapeXml(input.session_id) + '">',
      '  <attendance unique="' + input.unique_participants + '" duration_ms="' + input.duration_ms + '" chain_intact="' + input.attendance_chain_intact + '"/>',
      '  <scorm version="2004 4th Edition" conformance="ADL"/>',
      '</session>',
    ].join('\n');
    return { imsmanifest, imsxml, resource_id, organization_id, item_id };
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}