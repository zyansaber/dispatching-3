const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

// EmailJS configuration
const EMAILJS_CONFIG = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined,
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined,
  reportTemplateId: 'template_99eg2eg',
  transportTemplateId: 'template_ihncrv9',
};

export interface EmailData {
  chassisNo: string;
  sapData?: string | null;
  scheduledDealer?: string | null;
  reallocatedTo?: string | null;
  customer?: string | null;
  model?: string | null;
  statusCheck?: string | null;
  dealerCheck?: string | null;
  grDays?: number | null;
  errorNote?: string | null;
}

interface EmailTemplateParams {
  chassis_no: string;
  sap_data: string;
  scheduled_dealer: string;
  reallocated_to: string;
  customer: string;
  model: string;
  status_check: string;
  dealer_check: string;
  gr_days: number;
  report_date: string;
  issue_summary: string;
  error_note: string;
  to_name: string;
  from_name: string;
}

export interface TransportEmailData {
  chassisNo: string;
  soNumber?: string | null;
  vinNumber?: string | null;
  sapData?: string | null;
  scheduledDealer?: string | null;
  reallocatedTo?: string | null;
  customer?: string | null;
  model?: string | null;
  transportCompany?: string | null;
  previousCompany?: string | null;
  actionType: 'new' | 'change';
}

interface TransportTemplateParams {
  chassis_no: string;
  so_number: string;
  vin_number: string;
  sap_data: string;
  scheduled_dealer: string;
  reallocated_to: string;
  customer: string;
  model: string;
  transport_company: string;
  previous_company: string;
  action_type: string;
  updated_at: string;
  to_name: string;
  from_name: string;
}

const safeText = (value: string | null | undefined, fallback: string) =>
  (value && String(value).trim()) || fallback;

const toSafeNumber = (value: number | string | null | undefined, fallback = 0) => {
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(num as number) ? (num as number) : fallback;
};

const buildTemplateParams = (data: EmailData): EmailTemplateParams => {
  const fallbackSummary = `Dealer Check Mismatch detected for chassis ${data.chassisNo}`;
  const summary = safeText(data.errorNote, fallbackSummary);
  return {
    chassis_no: data.chassisNo,
    sap_data: safeText(data.sapData, 'N/A'),
    scheduled_dealer: safeText(data.scheduledDealer, 'N/A'),
    reallocated_to: safeText(data.reallocatedTo, 'No Reallocation'),
    customer: safeText(data.customer, 'N/A'),
    model: safeText(data.model, 'N/A'),
    status_check: safeText(data.statusCheck, 'Unknown'),
    dealer_check: safeText(data.dealerCheck, 'Unknown'),
    gr_days: toSafeNumber(data.grDays, 0),
    report_date: new Date().toLocaleString(),
    issue_summary: summary,
    error_note: safeText(data.errorNote, 'N/A'),
    to_name: 'Dispatch Team',
    from_name: 'Dispatch Dashboard System'
  };
};

const buildTransportTemplateParams = (data: TransportEmailData): TransportTemplateParams => ({
  chassis_no: data.chassisNo,
  so_number: safeText(data.soNumber, 'N/A'),
  vin_number: safeText(data.vinNumber, 'N/A'),
  sap_data: safeText(data.sapData, 'N/A'),
  scheduled_dealer: safeText(data.scheduledDealer, 'N/A'),
  reallocated_to: safeText(data.reallocatedTo, 'No Reallocation'),
  customer: safeText(data.customer, 'N/A'),
  model: safeText(data.model, 'N/A'),
  transport_company: safeText(data.transportCompany, 'N/A'),
  previous_company: safeText(data.previousCompany, 'N/A'),
  action_type: data.actionType,
  updated_at: new Date().toLocaleString(),
  to_name: 'Dispatch Team',
  from_name: 'Dispatch Dashboard System'
});

const requireConfig = (value: string | undefined, label: string) => {
  if (!value) {
    throw new Error(`Missing EmailJS configuration: ${label}`);
  }
  return value;
};

const readErrorMessage = async (response: Response) => {
  const raw = await response.text();
  if (!raw) return `${response.status} ${response.statusText}`.trim();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === 'string') {
      return parsed.error;
    }
    if (typeof parsed?.message === 'string') {
      return parsed.message;
    }
  } catch {
    // ignore JSON parse errors and fall back to raw string
  }
  return raw;
};

const sendEmailRequest = async (
  templateParams: EmailTemplateParams | TransportTemplateParams,
  templateId: string
): Promise<void> => {
  const response = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service_id: requireConfig(EMAILJS_CONFIG.serviceId, 'VITE_EMAILJS_SERVICE_ID'),
      template_id: templateId,
      user_id: requireConfig(EMAILJS_CONFIG.publicKey, 'VITE_EMAILJS_PUBLIC_KEY'),
      template_params: templateParams
    })
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || 'EmailJS request failed');
  }
};

export const sendReportEmail = async (data: EmailData): Promise<void> => {
  const templateParams = buildTemplateParams(data);
  console.log('Sending email with params:', templateParams);
  await sendEmailRequest(templateParams, EMAILJS_CONFIG.reportTemplateId);
};

export const sendTransportUpdateEmail = async (data: TransportEmailData): Promise<void> => {
  const templateParams = buildTransportTemplateParams(data);
  console.log('Sending transport email with params:', templateParams);
  await sendEmailRequest(templateParams, EMAILJS_CONFIG.transportTemplateId);
};

export const testEmailConnection = async (): Promise<void> => {
  const testParams: EmailTemplateParams = {
    chassis_no: 'TEST-001',
    sap_data: 'Test SAP Data',
    scheduled_dealer: 'Test Dealer',
    reallocated_to: 'Test Reallocation',
    customer: 'Test Customer',
    model: 'Test Model',
    status_check: 'Test',
    dealer_check: 'Test',
    gr_days: 0,
    report_date: new Date().toLocaleString(),
    issue_summary: 'Email connection test',
    error_note: 'Test error note',
    to_name: 'Test Recipient',
    from_name: 'Dispatch Dashboard System'
  };

  await sendEmailRequest(testParams, EMAILJS_CONFIG.reportTemplateId);
};
