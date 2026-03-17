import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  Library,
  Tags,
  Download,
  LayoutTemplate,
  Layers,
  Lightbulb,
  Flag,
  CopyPlus,
  Users,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  Pencil,
  User,
} from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

function PageCard({ page, sectionColor, labels }) {
  const [open, setOpen] = useState(false);
  const Icon = page.icon;

  return (
    <div
      style={{
        border: `1px solid var(--border-default)`,
        borderRadius: 20,
        background: 'var(--bg-elevated)',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.9rem',
          padding: '0.9rem 1.1rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: `color-mix(in srgb, ${sectionColor} 14%, transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={18} color={sectionColor} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{page.title}</strong>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>— {page.titleTh}</span>
          </span>
          {!open && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', display: 'block', marginTop: 2 }}>
              {page.what}
            </span>
          )}
        </span>
        <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 1.1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div style={{ padding: '0.7rem 0.9rem', borderRadius: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{labels.whatIs}</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{page.what}</span>
            </div>
            <div style={{ padding: '0.7rem 0.9rem', borderRadius: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{labels.canDo}</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{page.can}</span>
            </div>
          </div>
          <div style={{ padding: '0.55rem 0.9rem', borderRadius: 12, background: `color-mix(in srgb, ${sectionColor} 7%, var(--bg-primary))`, border: `1px solid color-mix(in srgb, ${sectionColor} 20%, transparent)`, display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: sectionColor, fontWeight: 700, flexShrink: 0 }}>{labels.tipLabel}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{page.tip}</span>
          </div>
          <Link
            to={page.path}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.9rem',
              borderRadius: 999,
              background: `color-mix(in srgb, ${sectionColor} 12%, transparent)`,
              color: sectionColor,
              fontSize: '0.82rem',
              fontWeight: 700,
              textDecoration: 'none',
              alignSelf: 'flex-start',
              border: `1px solid color-mix(in srgb, ${sectionColor} 24%, transparent)`,
            }}
          >
            {labels.goToPage} <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </div>
  );
}

export function AdminGuide() {
  const { t } = useLanguage();

  const SECTIONS = [
    {
      id: 'overview',
      label: t('admin.nav.overview'),
      color: '#6366f1',
      colorBg: 'rgba(99,102,241,0.08)',
      colorBorder: 'rgba(99,102,241,0.2)',
      pages: [
        {
          icon: LayoutDashboard,
          title: 'Dashboard',
          titleTh: 'หน้าหลัก',
          path: '/admin',
          what: 'หน้าแรกที่เห็นเมื่อเข้า Admin',
          can: 'ดูภาพรวมระบบ — จำนวนผู้ใช้, สื่อ, รายงาน, ข้อมูลซ้ำ, สถานะ Cache และผู้ใช้ล่าสุด',
          tip: 'เริ่มต้นจากที่นี่ทุกครั้ง เพื่อดูว่ามีอะไรต้องทำ',
        },
        {
          icon: BarChart3,
          title: 'Analytics',
          titleTh: 'วิเคราะห์ข้อมูล',
          path: '/admin/analytics',
          what: 'แดชบอร์ดสถิติและตัวเลขของระบบทั้งหมด',
          can: 'ดูสถิติคลังสื่อ, Editorial, คิวรายงาน และข้อมูลซ้ำ พร้อมกรองตามช่วงวันที่',
          tip: 'ใช้เมื่อต้องการดูภาพรวมเชิงตัวเลขหรือวัดผลการทำงาน',
        },
      ],
    },
    {
      id: 'catalog',
      label: t('admin.nav.catalog'),
      color: '#10b981',
      colorBg: 'rgba(16,185,129,0.07)',
      colorBorder: 'rgba(16,185,129,0.2)',
      pages: [
        {
          icon: Library,
          title: 'Titles',
          titleTh: 'รายการสื่อทั้งหมด',
          path: '/admin/titles',
          what: 'คลังหนัง / ซีรีส์ / อนิเมะ / มังงะ ที่มีในระบบ',
          can: 'ค้นหา, กรอง (ประเภท, ปี, คะแนน, ประเทศ ฯลฯ), ลบสื่อ มีตัวกรองมากกว่า 10 แบบ',
          tip: 'กดที่ชื่อสื่อเพื่อเข้าหน้าแก้ไขข้อมูลรายชิ้น',
        },
        {
          icon: Tags,
          title: 'Moods & Tags',
          titleTh: 'แท็กอารมณ์',
          path: '/admin/moods',
          what: 'ป้ายกำกับที่ใช้จัดหมวดหมู่สื่อตามอารมณ์ความรู้สึก',
          can: 'เพิ่ม / แก้ไข / ลบ Mood Tag พร้อมชื่อสองภาษา (ไทย-อังกฤษ), อีโมจิ และสี',
          tip: 'Mood Tag จะแสดงให้ผู้ใช้เลือกกรองสื่อในหน้า Discover',
        },
        {
          icon: Download,
          title: 'ดึงข้อมูล',
          titleTh: 'นำเข้าข้อมูลสื่อ',
          path: '/admin/fetch',
          what: 'เครื่องมือดึงข้อมูลสื่อจากแหล่งภายนอก',
          can: 'Sync หรือ Import ข้อมูลสื่อจาก API ภายนอกเข้าสู่คลัง',
          tip: 'ใช้เมื่อต้องการเพิ่มสื่อใหม่จำนวนมากเข้าระบบ',
        },
      ],
    },
    {
      id: 'editorial',
      label: t('admin.nav.editorial'),
      color: '#f59e0b',
      colorBg: 'rgba(245,158,11,0.07)',
      colorBorder: 'rgba(245,158,11,0.22)',
      pages: [
        {
          icon: LayoutTemplate,
          title: 'Homepage Blocks',
          titleTh: 'บล็อคหน้าแรก',
          path: '/admin/homepage',
          what: 'กำหนดว่าหน้าแรกของเว็บจะแสดงเนื้อหาอะไรบ้าง',
          can: 'เพิ่ม / ลบ / จัดลำดับบล็อค เช่น Hero Banner, Collection Grid, Trending, Recommendation ฯลฯ',
          tip: 'การเปลี่ยนแปลงที่นี่จะมีผลทันทีกับหน้าแรกที่ผู้ใช้เห็น',
        },
        {
          icon: Layers,
          title: 'Collections',
          titleTh: 'คอลเลกชัน',
          path: '/admin/collections',
          what: 'ชุดสื่อที่ทีมงานคัดมาให้ผู้ใช้',
          can: 'สร้าง / แก้ไข Collection แบบ Manual (เลือกเอง) หรือ Dynamic (กรองอัตโนมัติ) ตั้งค่าการมองเห็น, เรียงลำดับ',
          tip: 'Collection จะถูกดึงไปแสดงใน Homepage Blocks หรือหน้า Discover',
        },
        {
          icon: Lightbulb,
          title: 'Recommendations',
          titleTh: 'ตัวอย่างคำแนะนำ',
          path: '/admin/recommendations',
          what: 'ดูตัวอย่างว่าระบบแนะนำสื่อจะแสดงผลอย่างไรก่อน deploy',
          can: 'Preview คำแนะนำที่ผู้ใช้แต่ละคนจะเห็น ตามอัลกอริทึมของระบบ',
          tip: 'ใช้ตรวจสอบคุณภาพคำแนะนำก่อนเปิดให้ผู้ใช้จริง',
        },
      ],
    },
    {
      id: 'moderation',
      label: t('admin.nav.moderation'),
      color: '#ef4444',
      colorBg: 'rgba(239,68,68,0.07)',
      colorBorder: 'rgba(239,68,68,0.2)',
      pages: [
        {
          icon: Flag,
          title: 'Reports',
          titleTh: 'รายงานปัญหาจากผู้ใช้',
          path: '/admin/reports',
          what: 'คิวรายงานที่ผู้ใช้แจ้งปัญหาเข้ามา เช่น ข้อมูลผิด, เนื้อหาไม่เหมาะสม',
          can: 'ดู / กรองรายงาน, มอบหมายงานให้ Staff, เพิ่ม Note ภายใน, อัปเดตสถานะรายงาน',
          tip: 'ควรตรวจทุกวัน Dashboard จะแจ้งเตือนถ้ามีรายงานค้างอยู่',
        },
        {
          icon: CopyPlus,
          title: 'Duplicates',
          titleTh: 'ข้อมูลสื่อซ้ำ',
          path: '/admin/duplicates',
          what: 'ระบบตรวจจับสื่อที่ข้อมูลซ้ำกันในคลัง',
          can: 'สแกนหาข้อมูลซ้ำ, ดูค่า Confidence Score, เปรียบเทียบสื่อสองชิ้น และ Merge เข้าด้วยกัน',
          tip: 'ควร Merge ทุกครั้งก่อนเพิ่มสื่อใหม่เพื่อไม่ให้คลังซ้ำซ้อน',
        },
      ],
    },
    {
      id: 'users',
      label: t('admin.nav.users'),
      color: '#8b5cf6',
      colorBg: 'rgba(139,92,246,0.07)',
      colorBorder: 'rgba(139,92,246,0.2)',
      pages: [
        {
          icon: Users,
          title: 'User Directory',
          titleTh: 'รายชื่อผู้ใช้',
          path: '/admin/users',
          what: 'รายชื่อผู้ใช้ทั้งหมดในระบบ',
          can: 'ค้นหาด้วยชื่อ / อีเมล / ID, ดูข้อมูลผู้ใช้, เปลี่ยน Role (user / editor / admin)',
          tip: 'เฉพาะ Admin เท่านั้นที่เปลี่ยน Role ได้ Editor ไม่สามารถเข้าหน้านี้',
        },
      ],
    },
  ];

  const ROLES = [
    {
      icon: ShieldCheck,
      role: 'Admin',
      color: '#6366f1',
      bg: 'rgba(99,102,241,0.1)',
      desc: 'เข้าได้ทุกหน้าใน Admin รวมถึงเปลี่ยน Role ของผู้ใช้คนอื่น',
    },
    {
      icon: Pencil,
      role: 'Editor',
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
      desc: 'เข้าได้เกือบทุกหน้า ยกเว้น User Directory (จัดการ Role ไม่ได้)',
    },
    {
      icon: User,
      role: 'User',
      color: '#94a3b8',
      bg: 'rgba(148,163,184,0.1)',
      desc: 'ไม่สามารถเข้าหน้า Admin ได้เลย จะถูก Redirect กลับ',
    },
  ];

  const FLOW = [
    { step: '1', text: 'เริ่มจาก Dashboard', sub: 'ดูภาพรวม & รายการที่ต้องทำ', path: '/admin', color: '#6366f1' },
    { step: '2', text: 'จัดการ Catalog', sub: 'Titles, Moods, ดึงข้อมูล', path: '/admin/titles', color: '#10b981' },
    { step: '3', text: 'สร้าง Editorial', sub: 'Collections & Homepage Blocks', path: '/admin/collections', color: '#f59e0b' },
    { step: '4', text: 'ตรวจ Moderation', sub: 'Reports & Duplicates', path: '/admin/reports', color: '#ef4444' },
    { step: '5', text: 'ดู Analytics', sub: 'วัดผลและติดตามตัวเลข', path: '/admin/analytics', color: '#8b5cf6' },
  ];

  const cardLabels = {
    whatIs: t('admin.guide.whatIs'),
    canDo: t('admin.guide.canDo'),
    tipLabel: t('admin.guide.tipLabel'),
    goToPage: t('admin.guide.goToPage'),
  };

  return (
    <div className="admin-page-content animate-fade-in">

      {/* Header */}
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '1.6rem', marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <BookOpen size={26} />
            {t('admin.guide.pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {t('admin.guide.pageSubtitle')}
          </p>
        </div>
      </div>

      {/* Flow — แนะนำลำดับการใช้งาน */}
      <div className="glass-panel" style={{ marginBottom: 'var(--space-8)' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {t('admin.guide.flowTitle')}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
          {FLOW.map((item, i) => (
            <React.Fragment key={item.step}>
              <Link
                to={item.path}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '0.65rem 1rem',
                  borderRadius: 16,
                  background: `color-mix(in srgb, ${item.color} 10%, var(--bg-primary))`,
                  border: `1px solid color-mix(in srgb, ${item.color} 22%, transparent)`,
                  textDecoration: 'none',
                  minWidth: 130,
                  flex: '1 1 130px',
                  transition: 'transform 0.18s ease',
                }}
              >
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: item.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ขั้นที่ {item.step}
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.text}</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{item.sub}</span>
              </Link>
              {i < FLOW.length - 1 && (
                <ArrowRight size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Page Map by Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: 'var(--space-3)' }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: section.color,
                  flexShrink: 0,
                }}
              />
              <h2 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                {section.label}
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1rem', borderLeft: `2px solid color-mix(in srgb, ${section.color} 30%, var(--border-default))` }}>
              {section.pages.map((page) => (
                <PageCard key={page.path} page={page} sectionColor={section.color} labels={cardLabels} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Role Permissions */}
      <div className="glass-panel">
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {t('admin.guide.rolesTitle')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          {ROLES.map(({ icon: Icon, role, color, bg, desc }) => (
            <div
              key={role}
              style={{
                padding: 'var(--space-5)',
                borderRadius: 20,
                background: bg,
                border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Icon size={20} color={color} />
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{role}</strong>
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.55 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

export default AdminGuide;
