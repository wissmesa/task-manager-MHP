import sgMail from "@sendgrid/mail";

let _initialized = false;

function init() {
  if (!_initialized && process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    _initialized = true;
  }
}

const FROM_ADDRESS = () => process.env.SENDGRID_FROM || "noreply@mhpsalesmanager.com";

type EmailReason = "assigned" | "approval_needed" | "dept_approval_needed";
type StatusChangeType = "in_progress" | "completed" | "cancelled";

interface TaskNotificationData {
  taskTitle: string;
  taskDescription: string | null;
  priority: string;
  creatorName: string;
  departmentName: string | null;
  dueDate: string | null;
  taskUrl: string;
  reason: EmailReason;
}

const priorityEmoji: Record<string, string> = {
  low: "🟢",
  medium: "🔵",
  high: "🟠",
  urgent: "🔴",
};

export async function sendTaskCreatedEmail(
  recipientEmail: string,
  recipientName: string,
  data: TaskNotificationData
) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("SENDGRID_API_KEY not configured — skipping email notification");
    return;
  }

  init();

  const emoji = priorityEmoji[data.priority] || "⚪";

  const subjectByReason: Record<EmailReason, string> = {
    assigned: `${emoji} Task Assigned: ${data.taskTitle}`,
    approval_needed: `${emoji} Approval Needed: ${data.taskTitle}`,
    dept_approval_needed: `${emoji} Dept. Approval Needed: ${data.taskTitle}`,
  };
  const subject = subjectByReason[data.reason];

  const messageByReason: Record<EmailReason, string> = {
    assigned: `Hi <strong>${recipientName}</strong>, a new task has been assigned to you by <strong>${data.creatorName}</strong>.`,
    approval_needed: `Hi <strong>${recipientName}</strong>, a new task created by <strong>${data.creatorName}</strong> requires your approval.`,
    dept_approval_needed: `Hi <strong>${recipientName}</strong>, a task created by <strong>${data.creatorName}</strong> has been approved by the coordinator and now requires your department approval.`,
  };

  const headingByReason: Record<EmailReason, string> = {
    assigned: "Task Assigned to You",
    approval_needed: "New Task — Approval Required",
    dept_approval_needed: "New Task — Department Approval Required",
  };

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
        <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px;">${headingByReason[data.reason]}</h2>
        
        <p style="margin: 0 0 16px; color: #475569;">
          ${messageByReason[data.reason]}
        </p>

        <div style="background: white; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 120px;">Title</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${data.taskTitle}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Priority</td>
              <td style="padding: 8px 0; color: #1e293b;">${emoji} ${data.priority.charAt(0).toUpperCase() + data.priority.slice(1)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Created by</td>
              <td style="padding: 8px 0; color: #1e293b;">${data.creatorName}</td>
            </tr>
            ${data.departmentName ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Department</td>
              <td style="padding: 8px 0; color: #1e293b;">${data.departmentName}</td>
            </tr>` : ""}
            ${data.dueDate ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Due Date</td>
              <td style="padding: 8px 0; color: #1e293b;">${data.dueDate}</td>
            </tr>` : ""}
          </table>
        </div>

        ${data.taskDescription ? `
        <div style="background: white; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; color: #64748b; font-size: 14px;">Description</p>
          <p style="margin: 0; color: #1e293b; white-space: pre-wrap;">${data.taskDescription}</p>
        </div>` : ""}

        <a href="${data.taskUrl}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
          View Task
        </a>
      </div>
      
      <p style="margin: 16px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">
        Task Manager — MHP Sales Manager
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: recipientEmail,
      from: FROM_ADDRESS(),
      subject,
      html,
    });
  } catch (err) {
    console.error("Failed to send task notification email:", err);
  }
}

interface StatusChangeNotificationData {
  taskTitle: string;
  taskUrl: string;
  newStatus: StatusChangeType;
  changedByName: string;
}

export async function sendStatusChangeEmail(
  recipientEmail: string,
  recipientName: string,
  data: StatusChangeNotificationData
) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("SENDGRID_API_KEY not configured — skipping email notification");
    return;
  }

  init();

  const statusConfig: Record<StatusChangeType, { label: string; emoji: string; color: string; message: string }> = {
    in_progress: {
      label: "In Progress",
      emoji: "🔵",
      color: "#3b82f6",
      message: "has been moved to <strong>In Progress</strong>",
    },
    completed: {
      label: "Completed",
      emoji: "✅",
      color: "#22c55e",
      message: "has been marked as <strong>Completed</strong>",
    },
    cancelled: {
      label: "Cancelled",
      emoji: "❌",
      color: "#ef4444",
      message: "has been <strong>Cancelled</strong>",
    },
  };

  const cfg = statusConfig[data.newStatus];

  const subject = `${cfg.emoji} Task ${cfg.label}: ${data.taskTitle}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
        <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px;">Task Status Update</h2>
        
        <p style="margin: 0 0 16px; color: #475569;">
          Hi <strong>${recipientName}</strong>, your task ${cfg.message} by <strong>${data.changedByName}</strong>.
        </p>

        <div style="background: white; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 120px;">Task</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${data.taskTitle}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">New Status</td>
              <td style="padding: 8px 0;">
                <span style="background: ${cfg.color}20; color: ${cfg.color}; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 500;">
                  ${cfg.emoji} ${cfg.label}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Changed by</td>
              <td style="padding: 8px 0; color: #1e293b;">${data.changedByName}</td>
            </tr>
          </table>
        </div>

        <a href="${data.taskUrl}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">
          View Task
        </a>
      </div>
      
      <p style="margin: 16px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">
        Task Manager — MHP Sales Manager
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: recipientEmail,
      from: FROM_ADDRESS(),
      subject,
      html,
    });
  } catch (err) {
    console.error("Failed to send status change email:", err);
  }
}
