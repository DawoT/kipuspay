/**
 * UBL DespatchAdvice (GRE `31`) — zero-dep Web Platform.
 * Arquitectura §5.2b / ADR-FISCAL-004. 0 stock: solo declara el traslado.
 */
/* eslint-disable no-secrets/no-secrets -- plantillas XML UBL normativas */
import { assertWellFormedXml, escapeXml } from './ubl-shared.js';

export interface UblDespatchLine {
  readonly id: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitCode: string;
}

export interface UblDespatchInput {
  readonly ublVersion: '2.1';
  readonly id: string;
  readonly issueDate: string;
  readonly issueTime: string;
  readonly issuerRuc: string;
  readonly issuerName: string;
  readonly transferReasonCode: string;
  readonly transportModeCode: string;
  readonly vehiclePlate: string;
  readonly carrierDocumentType: string;
  readonly carrierDocumentNumber: string;
  readonly carrierName: string;
  readonly originUbigeo: string;
  readonly originAddress: string;
  readonly destinationUbigeo: string;
  readonly destinationAddress: string;
  readonly transferStartedAt: string;
  readonly lines: readonly UblDespatchLine[];
}

export function buildUblDespatchXml(input: UblDespatchInput): string {
  if (input.ublVersion !== '2.1') throw new Error('UNSUPPORTED_UBL_VERSION');
  if (!/^\d{11}$/.test(input.issuerRuc)) throw new Error('INVALID_ISSUER_RUC');
  if (!input.lines.length) throw new Error('EMPTY_LINES');

  const linesXml = input.lines
    .map(
      (line) => `
  <cac:DespatchLine>
    <cbc:ID>${line.id}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${escapeXml(line.unitCode)}">${line.quantity}</cbc:DeliveredQuantity>
    <cac:Item>
      <cbc:Description>${escapeXml(line.description)}</cbc:Description>
    </cac:Item>
  </cac:DespatchLine>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${escapeXml(input.id)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escapeXml(input.issueTime)}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>31</cbc:DespatchAdviceTypeCode>
  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escapeXml(input.issuerRuc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.issuerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DespatchSupplierParty>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escapeXml(input.issuerRuc)}</cbc:ID>
      </cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cbc:HandlingCode>${escapeXml(input.transferReasonCode)}</cbc:HandlingCode>
    <cac:ShipmentStage>
      <cbc:TransportModeCode>${escapeXml(input.transportModeCode)}</cbc:TransportModeCode>
      <cac:TransitPeriod>
        <cbc:StartDate>${escapeXml(input.transferStartedAt.slice(0, 10))}</cbc:StartDate>
      </cac:TransitPeriod>
      <cac:CarrierParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="${escapeXml(input.carrierDocumentType)}">${escapeXml(input.carrierDocumentNumber)}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name>${escapeXml(input.carrierName)}</cbc:Name>
        </cac:PartyName>
      </cac:CarrierParty>
      <cac:TransportMeans>
        <cac:RoadTransport>
          <cbc:LicensePlateID>${escapeXml(input.vehiclePlate)}</cbc:LicensePlateID>
        </cac:RoadTransport>
      </cac:TransportMeans>
    </cac:ShipmentStage>
    <cac:Delivery>
      <cac:DeliveryAddress>
        <cbc:ID>${escapeXml(input.destinationUbigeo)}</cbc:ID>
        <cbc:StreetName>${escapeXml(input.destinationAddress)}</cbc:StreetName>
      </cac:DeliveryAddress>
    </cac:Delivery>
    <cac:OriginAddress>
      <cbc:ID>${escapeXml(input.originUbigeo)}</cbc:ID>
      <cbc:StreetName>${escapeXml(input.originAddress)}</cbc:StreetName>
    </cac:OriginAddress>
  </cac:Shipment>${linesXml}
</DespatchAdvice>
`;
  assertWellFormedXml(xml);
  return xml;
}

export function assertValidDespatchXml(xml: string): void {
  assertWellFormedXml(xml);
  if (!xml.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>')) {
    throw new Error('INVALID_UBL_VERSION');
  }
  if (!xml.includes('<cbc:DespatchAdviceTypeCode>31</cbc:DespatchAdviceTypeCode>')) {
    throw new Error('MISSING_DESPATCH_TYPE');
  }
  if (!xml.includes('schemeID="6"')) throw new Error('MISSING_ISSUER_RUC');
  if (!xml.includes('<cac:DespatchLine>')) throw new Error('MISSING_LINES');
  if (xml.toLowerCase().includes('contingencia')) throw new Error('CONTINGENCIA_FORBIDDEN');
}
