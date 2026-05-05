/**
 * Basit HTML mail şablonları.
 * İhtiyaca göre genişletilebilir.
 */

const baseLayout = (content: string) => `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="background:#1e293b;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Axon ERP</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center;">
        Bu e-posta Axon ERP tarafından otomatik olarak gönderilmiştir.
      </td>
    </tr>
  </table>
</body>
</html>`;

// ── Hoş geldin ───────────────────────────────
export function welcomeEmail(name: string) {
  return {
    subject: 'Axon ERP\'ye Hoş Geldiniz',
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">Merhaba ${name},</h2>
      <p style="color:#475569;line-height:1.6;">
        Axon ERP ailesine katıldığınız için teşekkür ederiz. Hesabınız başarıyla oluşturuldu.
      </p>
      <p style="color:#475569;line-height:1.6;">
        Herhangi bir sorunuz olursa destek ekibimize ulaşabilirsiniz.
      </p>
    `),
  };
}

// ── Şifre sıfırlama ─────────────────────────
export function passwordResetEmail(name: string, resetUrl: string) {
  return {
    subject: 'Şifre Sıfırlama Talebi',
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">Merhaba ${name},</h2>
      <p style="color:#475569;line-height:1.6;">
        Şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
          Şifremi Sıfırla
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;">
        Bu talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz. Link 1 saat geçerlidir.
      </p>
    `),
  };
}

// ── Fatura bildirimi ─────────────────────────
export function invoiceNotificationEmail(
  name: string,
  invoiceNo: string,
  amount: string,
) {
  return {
    subject: `Yeni Fatura: ${invoiceNo}`,
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">Merhaba ${name},</h2>
      <p style="color:#475569;line-height:1.6;">
        <strong>${invoiceNo}</strong> numaralı faturanız oluşturulmuştur.
      </p>
      <div style="background:#f8fafc;padding:16px;border-radius:6px;margin:16px 0;">
        <p style="margin:0;color:#1e293b;font-size:18px;font-weight:600;">Tutar: ${amount}</p>
      </div>
      <p style="color:#475569;line-height:1.6;">
        Detaylar için Axon ERP paneline giriş yapabilirsiniz.
      </p>
    `),
  };
}

// ── Genel bildirim ───────────────────────────
export function genericNotificationEmail(title: string, message: string) {
  return {
    subject: title,
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">${title}</h2>
      <p style="color:#475569;line-height:1.6;">${message}</p>
    `),
  };
}

// ── Demo hesap hazır ─────────────────────────
export function demoReadyEmail(
  name: string,
  plan: string,
  setPasswordUrl: string,
  trialEndsAt: Date,
) {
  const planLabel = plan === 'STARTER' ? 'Starter' : plan === 'PROFESSIONAL' ? 'Professional' : 'Enterprise';
  const trialEnd = trialEndsAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    subject: 'Demo Hesabınız Hazır – Axon ERP',
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">Merhaba ${name},</h2>
      <p style="color:#475569;line-height:1.6;">
        <strong>${planLabel}</strong> planı ile demo hesabınız başarıyla oluşturuldu.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:16px;border-radius:6px;margin:16px 0;">
        <p style="margin:0 0 8px;color:#166534;font-weight:600;">Demo Bilgileri</p>
        <p style="margin:0;color:#15803d;">Plan: ${planLabel}</p>
        <p style="margin:0;color:#15803d;">Deneme Süresi: ${trialEnd} tarihine kadar</p>
      </div>
      <p style="color:#475569;line-height:1.6;">
        Hesabınıza erişmek için önce şifrenizi belirlemeniz gerekmektedir:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${setPasswordUrl}" style="display:inline-block;padding:14px 36px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">
          Şifremi Belirle
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;">
        Bu link 1 saat geçerlidir. Süre dolduysa yeni bir link talep edebilirsiniz.
      </p>
    `),
  };
}

// ── Admin tenant oluşturma – şifre belirleme ──
export function tenantReadyEmail(
  name: string,
  companyName: string,
  plan: string,
  setPasswordUrl: string,
) {
  const planLabel = plan === 'STARTER' ? 'Starter' : plan === 'PROFESSIONAL' ? 'Professional' : 'Enterprise';

  return {
    subject: 'Axon ERP hesabınız hazır',
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">Merhaba ${name},</h2>
      <p style="color:#475569;line-height:1.6;">
        <strong>${companyName}</strong> için Axon ERP hesabınız oluşturuldu.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:16px;border-radius:6px;margin:16px 0;">
        <p style="margin:0;color:#334155;">Plan: <strong>${planLabel}</strong></p>
      </div>
      <p style="color:#475569;line-height:1.6;">
        Hesabınıza erişmek için önce şifrenizi belirlemeniz gerekmektedir:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${setPasswordUrl}" style="display:inline-block;padding:14px 36px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">
          Şifremi Belirle
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;">
        Bu link 1 saat geçerlidir.
      </p>
    `),
  };
}

// ── Enterprise demo – satış ekibine bildirim ─
export function demoEnterpriseNotifyEmail(
  fullName: string,
  companyName: string,
  email: string,
) {
  return {
    subject: `Yeni Enterprise Demo Talebi: ${companyName}`,
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">Yeni Enterprise Demo Talebi</h2>
      <div style="background:#fef3c7;border:1px solid #fde68a;padding:16px;border-radius:6px;margin:16px 0;">
        <p style="margin:0 0 8px;color:#92400e;"><strong>Ad Soyad:</strong> ${fullName}</p>
        <p style="margin:0 0 8px;color:#92400e;"><strong>Şirket:</strong> ${companyName}</p>
        <p style="margin:0;color:#92400e;"><strong>E-posta:</strong> ${email}</p>
      </div>
      <p style="color:#475569;line-height:1.6;">
        Bu talep manuel onay beklemektedir. Admin panelinden onaylayabilir veya reddedebilirsiniz.
      </p>
    `),
  };
}

// ── Kullanıcı davet maili ────────────────────
export function invitationEmail(
  companyName: string,
  inviteUrl: string,
  roleName?: string,
) {
  const roleText = roleName ? `<strong>${roleName}</strong> rolüyle ` : '';

  return {
    subject: `${companyName} sizi Axon ERP'ye davet ediyor`,
    html: baseLayout(`
      <h2 style="margin:0 0 16px;color:#1e293b;">Axon ERP'ye Davet Edildiniz</h2>
      <p style="color:#475569;line-height:1.6;">
        <strong>${companyName}</strong> sizi ${roleText}Axon ERP platformuna davet etti.
      </p>
      <p style="color:#475569;line-height:1.6;">
        Daveti kabul etmek ve hesabınızı oluşturmak için aşağıdaki butona tıklayın:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${inviteUrl}" style="display:inline-block;padding:14px 36px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">
          Daveti Kabul Et
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;">
        Bu link 48 saat geçerlidir. Daveti siz talep etmediyseniz bu e-postayı görmezden gelebilirsiniz.
      </p>
    `),
  };
}
