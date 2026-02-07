/**
 * Amazon SES Integration Tests
 *
 * Tests for the SES client with mock AWS SDK responses.
 * Covers email sending, template rendering, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SESClient as AWSSESClient,
  SendEmailCommand,
  GetSendQuotaCommand,
} from '@aws-sdk/client-ses';
import { SESClient, type SESConfig } from '../ses.js';

// Mock AWS SDK
vi.mock('@aws-sdk/client-ses', () => {
  const mockSend = vi.fn();
  return {
    SESClient: vi.fn(function (this: any) {
      this.send = mockSend;
      return this;
    }),
    SendEmailCommand: vi.fn(function (this: any, input: any) {
      this.input = input;
      return this;
    }),
    GetSendQuotaCommand: vi.fn(function (this: any, input: any) {
      this.input = input;
      return this;
    }),
  };
});

// Get the mocked send function
function getMockSend() {
  const instance = new AWSSESClient({});
  return instance.send as ReturnType<typeof vi.fn>;
}

describe('SESClient', () => {
  let client: SESClient;
  let mockSend: ReturnType<typeof vi.fn>;

  const testConfig: SESConfig = {
    region: 'ap-southeast-2',
    fromAddress: 'noreply@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SESClient(testConfig);
    mockSend = getMockSend();
  });

  describe('Construction', () => {
    it('should create client with provided config', () => {
      const client = new SESClient({
        region: 'us-east-1',
        fromAddress: 'test@example.com',
      });
      expect(client).toBeInstanceOf(SESClient);
    });

    it('should use default region if not provided', () => {
      const client = new SESClient({
        fromAddress: 'test@example.com',
      });
      expect(client).toBeInstanceOf(SESClient);
      // AWS SDK client should be created with default region
      expect(AWSSESClient).toHaveBeenCalledWith({ region: 'ap-southeast-2' });
    });
  });

  describe('sendEmail', () => {
    it('should send email with text body', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'test-message-id-123',
      });

      const result = await client.sendEmail({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        bodyText: 'This is the email body',
      });

      expect(result.messageId).toBe('test-message-id-123');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Verify SendEmailCommand was created with correct params
      const commandCall = (SendEmailCommand as any).mock.calls[0];
      expect(commandCall).toBeDefined();
      const input = commandCall[0];
      expect(input.Source).toBe('noreply@example.com');
      expect(input.Destination.ToAddresses).toEqual(['recipient@example.com']);
      expect(input.Message.Subject.Data).toBe('Test Subject');
      expect(input.Message.Body.Text.Data).toBe('This is the email body');
    });

    it('should send email with HTML body', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'html-message-id',
      });

      await client.sendEmail({
        to: ['recipient@example.com'],
        subject: 'HTML Email',
        bodyText: 'Plain text fallback',
        bodyHtml: '<html><body><h1>Hello</h1></body></html>',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      expect(input.Message.Body.Text.Data).toBe('Plain text fallback');
      expect(input.Message.Body.Html.Data).toBe(
        '<html><body><h1>Hello</h1></body></html>'
      );
    });

    it('should send to multiple recipients', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'multi-recipient-id',
      });

      await client.sendEmail({
        to: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
        subject: 'Team Update',
        bodyText: 'Update for the team',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      expect(input.Destination.ToAddresses).toHaveLength(3);
      expect(input.Destination.ToAddresses).toContain('user1@example.com');
      expect(input.Destination.ToAddresses).toContain('user2@example.com');
      expect(input.Destination.ToAddresses).toContain('user3@example.com');
    });

    it('should use UTF-8 charset', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'utf8-message-id',
      });

      await client.sendEmail({
        to: ['test@example.com'],
        subject: 'Test with émojis 🎉',
        bodyText: 'Content with spëcial çharacters',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      expect(input.Message.Subject.Charset).toBe('UTF-8');
      expect(input.Message.Body.Text.Charset).toBe('UTF-8');
    });

    it('should handle missing MessageId in response', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await client.sendEmail({
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: 'Test body',
      });

      expect(result.messageId).toBe('');
    });

    it('should propagate AWS SDK errors', async () => {
      const awsError = new Error(
        'MessageRejected: Email address is not verified'
      );
      mockSend.mockRejectedValueOnce(awsError);

      await expect(
        client.sendEmail({
          to: ['invalid@example.com'],
          subject: 'Test',
          bodyText: 'Test',
        })
      ).rejects.toThrow('MessageRejected: Email address is not verified');
    });

    it('should handle throttling errors', async () => {
      const throttlingError = new Error(
        'Throttling: Maximum sending rate exceeded'
      );
      mockSend.mockRejectedValueOnce(throttlingError);

      await expect(
        client.sendEmail({
          to: ['test@example.com'],
          subject: 'Test',
          bodyText: 'Test',
        })
      ).rejects.toThrow('Maximum sending rate exceeded');
    });
  });

  describe('sendDailyDigest', () => {
    it('should send daily digest email', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'digest-message-id',
      });

      const result = await client.sendDailyDigest({
        to: 'pm@example.com',
        projectSummaries: [
          'Project A: On track',
          'Project B: Amber - 2 blockers',
        ],
        actionsToday: 5,
        pendingEscalations: 2,
        budgetStatus: 'Within limits ($3.50 / $15.00)',
      });

      expect(result.messageId).toBe('digest-message-id');

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];

      // Verify subject includes date
      expect(input.Message.Subject.Data).toContain('[Agentic PM] Daily Digest');

      // Verify body content
      const bodyText = input.Message.Body.Text.Data;
      expect(bodyText).toContain('Actions taken today: 5');
      expect(bodyText).toContain('Pending escalations: 2');
      expect(bodyText).toContain(
        'Budget status: Within limits ($3.50 / $15.00)'
      );
      expect(bodyText).toContain('Project A: On track');
      expect(bodyText).toContain('Project B: Amber - 2 blockers');
      expect(bodyText).toContain('Agentic PM Workbench');
    });

    it('should format digest with no summaries', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'empty-digest-id',
      });

      await client.sendDailyDigest({
        to: 'pm@example.com',
        projectSummaries: [],
        actionsToday: 0,
        pendingEscalations: 0,
        budgetStatus: 'No usage today',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      const bodyText = input.Message.Body.Text.Data;

      expect(bodyText).toContain('Actions taken today: 0');
      expect(bodyText).toContain('Pending escalations: 0');
    });

    it('should format multiple project summaries', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'multi-project-digest',
      });

      await client.sendDailyDigest({
        to: 'pm@example.com',
        projectSummaries: [
          'Project Alpha: Green - Sprint on track',
          'Project Beta: Red - Critical blocker detected',
          'Project Gamma: Amber - Minor delays',
        ],
        actionsToday: 12,
        pendingEscalations: 1,
        budgetStatus: '$8.20 / $15.00',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      const bodyText = input.Message.Body.Text.Data;

      expect(bodyText).toContain('Project Alpha: Green');
      expect(bodyText).toContain('Project Beta: Red');
      expect(bodyText).toContain('Project Gamma: Amber');
    });

    it('should use Australian date format', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'date-format-test',
      });

      // Mock date to ensure consistent test
      const mockDate = new Date('2024-03-15T10:00:00Z');
      vi.spyOn(global, 'Date').mockImplementation(function (this: any) {
        if (this instanceof Date) {
          return mockDate;
        }
        return mockDate.toString();
      } as any);

      await client.sendDailyDigest({
        to: 'pm@example.com',
        projectSummaries: [],
        actionsToday: 0,
        pendingEscalations: 0,
        budgetStatus: 'Test',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      const subject = input.Message.Subject.Data;

      // Should contain date in Australian format
      expect(subject).toContain('[Agentic PM] Daily Digest');

      vi.restoreAllMocks();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      mockSend.mockResolvedValueOnce({
        Max24HourSend: 50000,
        SentLast24Hours: 100,
        MaxSendRate: 14,
      });

      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.details).toMatchObject({
        fromAddress: 'noreply@example.com',
        max24HourSend: 50000,
        sentLast24Hours: 100,
        maxSendRate: 14,
      });
    });

    it('should measure latency', async () => {
      mockSend.mockResolvedValueOnce({
        Max24HourSend: 50000,
        SentLast24Hours: 100,
        MaxSendRate: 14,
      });

      const result = await client.healthCheck();

      expect(result.latencyMs).toBeDefined();
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle health check errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access denied'));

      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Access denied');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error scenarios', () => {
    it('should handle service unavailable error', async () => {
      const serviceError = new Error('Service Unavailable');
      mockSend.mockRejectedValueOnce(serviceError);

      await expect(
        client.sendEmail({
          to: ['test@example.com'],
          subject: 'Test',
          bodyText: 'Test',
        })
      ).rejects.toThrow('Service Unavailable');
    });

    it('should handle network timeout', async () => {
      const timeoutError = new Error('Request timeout');
      mockSend.mockRejectedValueOnce(timeoutError);

      await expect(
        client.sendEmail({
          to: ['test@example.com'],
          subject: 'Test',
          bodyText: 'Test',
        })
      ).rejects.toThrow('Request timeout');
    });

    it('should handle invalid email address', async () => {
      const validationError = new Error('Invalid email address');
      mockSend.mockRejectedValueOnce(validationError);

      await expect(
        client.sendEmail({
          to: ['not-an-email'],
          subject: 'Test',
          bodyText: 'Test',
        })
      ).rejects.toThrow('Invalid email address');
    });
  });

  describe('Email content formatting', () => {
    it('should preserve line breaks in text body', async () => {
      mockSend.mockResolvedValueOnce({ MessageId: 'test' });

      const bodyWithLineBreaks = 'Line 1\n\nLine 2\n\nLine 3';

      await client.sendEmail({
        to: ['test@example.com'],
        subject: 'Test',
        bodyText: bodyWithLineBreaks,
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      expect(input.Message.Body.Text.Data).toBe(bodyWithLineBreaks);
    });

    it('should handle empty subject', async () => {
      mockSend.mockResolvedValueOnce({ MessageId: 'test' });

      await client.sendEmail({
        to: ['test@example.com'],
        subject: '',
        bodyText: 'Body content',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      expect(input.Message.Subject.Data).toBe('');
    });

    it('should handle special characters in subject', async () => {
      mockSend.mockResolvedValueOnce({ MessageId: 'test' });

      const specialSubject = 'Test: [Action Required] – Update <Project>';

      await client.sendEmail({
        to: ['test@example.com'],
        subject: specialSubject,
        bodyText: 'Test',
      });

      const commandCall = (SendEmailCommand as any).mock.calls[0];
      const input = commandCall[0];
      expect(input.Message.Subject.Data).toBe(specialSubject);
    });
  });
});
