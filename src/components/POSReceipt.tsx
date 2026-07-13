/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Invoice } from '../types';

interface POSReceiptProps {
  invoice: Invoice | null;
  systemConfig: any;
}

export default function POSReceipt({ invoice, systemConfig }: POSReceiptProps) {
  if (!invoice) return null;

  const logo = systemConfig.invoiceLogo || '🐾';
  const hospitalName = systemConfig.hospitalName || 'Ceylon Pets Hospital';
  const hospitalAddress = systemConfig.hospitalAddress || '';
  const hospitalPhone = systemConfig.hospitalPhone || '';
  const footerMessage = systemConfig.invoiceFooterMessage || '';
  const subFooterMessage = systemConfig.invoiceSubFooterMessage || '';
  const extraFooterMessage = systemConfig.invoiceExtraFooterMessage || '';
  const currency = systemConfig.currencySymbol || 'Rs. ';

  const dashedLine = '- '.repeat(38);
  const doubleLine = '='.repeat(38);

  const dateStr = new Date(invoice.date).toLocaleString();
  const invoiceNum = invoice.id.slice(0, 8).toUpperCase();

  const showClient = invoice.ownerName !== 'Walk-in Client';
  const showPet = invoice.petName !== 'Retail Sale';
  const showPhone = invoice.ownerPhone !== '0000000000';

  const capitalizeFirst = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  return (
    <div id="pos-thermal-receipt" style={{ background: 'white' }}>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { height: auto !important; max-height: none !important; overflow: visible !important; }
          body > * { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          #pos-thermal-receipt { display: block !important; visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 80mm !important; height: auto !important; overflow: visible !important; z-index: 999999 !important; }
          #pos-thermal-receipt * { visibility: visible !important; }
        }
      `}</style>

      <div style={{
        width: '302px',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '12px',
        color: '#000',
        padding: '8px',
        boxSizing: 'border-box',
      }}>

        {/* ============ HOSPITAL HEADER ============ */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '28px', lineHeight: '1.2' }}>{logo}</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '4px' }}>
            {hospitalName}
          </div>
          {hospitalAddress && (
            <div style={{ fontSize: '11px', marginTop: '2px' }}>{hospitalAddress}</div>
          )}
          {hospitalPhone && (
            <div style={{ fontSize: '11px', marginTop: '2px' }}>{hospitalPhone}</div>
          )}
        </div>
        <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {dashedLine}
        </div>

        {/* ============ TRANSACTION INFO ============ */}
        <div style={{ margin: '4px 0' }}>
          <div>Date: {dateStr}</div>
          <div>Invoice #: {invoiceNum}</div>
          <div>Cashier: {invoice.createdBy}</div>
        </div>
        <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {dashedLine}
        </div>

        {/* ============ CLIENT INFO ============ */}
        {(showClient || showPet || showPhone) && (
          <>
            <div style={{ margin: '4px 0' }}>
              {showClient && <div>Client: {invoice.ownerName}</div>}
              {showPet && <div>Patient: {invoice.petName}</div>}
              {showPhone && <div>Phone: {invoice.ownerPhone}</div>}
            </div>
            <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {dashedLine}
            </div>
          </>
        )}

        {/* ============ LINE ITEMS ============ */}
        <div style={{ margin: '4px 0' }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '2px' }}>
            <span style={{ flex: 1, textAlign: 'left' }}>Item</span>
            <span style={{ width: '40px', textAlign: 'center' }}>Qty</span>
            <span style={{ width: '80px', textAlign: 'right' }}>Amount</span>
          </div>
          <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap', borderBottom: 'none' }}>
            {'─'.repeat(38)}
          </div>

          {/* Item rows */}
          {invoice.items.map((item, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>
              <div style={{ textAlign: 'left', fontWeight: 'normal' }}>{item.name}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '11px' }}>
                <span>{item.quantity} x {currency}{item.unitPrice.toFixed(2)} = {currency}{item.totalPrice.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {dashedLine}
        </div>

        {/* ============ TOTALS ============ */}
        <div style={{ margin: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal</span>
            <span>{currency}{invoice.subtotal.toFixed(2)}</span>
          </div>
          {invoice.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount</span>
              <span>-{currency}{invoice.discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap', margin: '4px 0' }}>
            {doubleLine}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
            <span>TOTAL</span>
            <span>{currency}{invoice.sales_total.toFixed(2)}</span>
          </div>
        </div>

        {/* ============ PAYMENT METHOD ============ */}
        <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap', margin: '4px 0' }}>
          {dashedLine}
        </div>
        <div style={{ margin: '4px 0' }}>
          {invoice.paymentMethod === 'split' && invoice.splitPayments ? (
            <>
              <div>Payment: Split</div>
              {invoice.splitPayments.map((sp, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>  {capitalizeFirst(sp.method.replace('_', ' '))}</span>
                  <span>{currency}{sp.amount.toFixed(2)}</span>
                </div>
              ))}
            </>
          ) : (
            <div>Payment: {capitalizeFirst((invoice.paymentMethod || 'cash').replace('_', ' '))}</div>
          )}
        </div>
        <div style={{ fontSize: '10px', letterSpacing: '-0.5px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {dashedLine}
        </div>

        {/* ============ FOOTER ============ */}
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          {footerMessage && (
            <div style={{ fontStyle: 'italic', fontSize: '12px', marginBottom: '4px' }}>{footerMessage}</div>
          )}
          {subFooterMessage && (
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>{subFooterMessage}</div>
          )}
          {extraFooterMessage && (
            <div style={{ fontSize: '10px', marginBottom: '4px' }}>{extraFooterMessage}</div>
          )}
        </div>

        {/* Paper feed / cut margin */}
        <div style={{ height: '48px' }}></div>
        <br /><br /><br /><br />
      </div>
    </div>
  );
}
