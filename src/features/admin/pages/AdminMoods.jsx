import React, { useState, useEffect } from 'react';
import { supabase } from '@/shared/lib/supabase';
import toast from 'react-hot-toast';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

export function AdminMoods() {
  const { t } = useLanguage();
  const [moods, setMoods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingMood, setEditingMood] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMood, setNewMood] = useState({ id: '', name_th: '', name_en: '', icon: '', description: '', color: '#7c3aed' });

  useEffect(() => {
    fetchMoods();
  }, []);

  async function fetchMoods() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('moods')
        .select('*')
        .order('id');
      if (error) throw error;
      setMoods(data || []);
    } catch (err) {
      console.warn('Error fetching moods:', err);
      toast.error('โหลดข้อมูลอารมณ์ไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveMood(mood) {
    if (!mood.id || !mood.name_en || !mood.name_th) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }

    const toastId = toast.loading('กำลังบันทึกข้อมูล...');
    try {
      if (editingMood) {
        const { error } = await supabase
          .from('moods')
          .update({
            name_th: mood.name_th,
            name_en: mood.name_en,
            icon: mood.icon,
            description: mood.description,
            color: mood.color
          })
          .eq('id', mood.id);
        if (error) throw error;
        toast.success(t('admin.moods.saved'), { id: toastId });
      } else {
        const { error } = await supabase.from('moods').insert([mood]);
        if (error) throw error;
        toast.success(t('admin.moods.added'), { id: toastId });
      }
      setEditingMood(null);
      setShowAddForm(false);
      setNewMood({ id: '', name_th: '', name_en: '', icon: '', description: '', color: '#7c3aed' });
      fetchMoods();
    } catch (err) {
      console.error('Save error:', err);
      toast.error(t('admin.moods.saveFailed', { error: err.message }), { id: toastId });
    }
  }

  async function handleDeleteMood(id, name) {
    const isConfirmed = window.confirm(t('admin.moods.confirmDelete', { name }));

    if (!isConfirmed) return;

    const toastId = toast.loading('กำลังลบข้อมูล...');
    try {
      const { error } = await supabase.from('moods').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('admin.moods.deleted'), { id: toastId });
      fetchMoods();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(t('admin.moods.saveFailed', { error: err.message }), { id: toastId });
    }
  }

  const MoodForm = ({ mood, onSave, onCancel, isNew }) => {
    const [form, setForm] = useState(mood);
    return (
      <div className="glass-panel animate-fade-in" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)', border: '1px solid var(--primary-200)' }}>
        <h3 style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isNew ? '✨ เพิ่มอารมณ์/แท็กใหม่' : `✏️ แก้ไขข้อมูล: ${mood.name_en}`}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <div>
            <label className="form-label">{t('admin.moods.colId')} *</label>
            <input className="form-input" value={form.id} onChange={e => setForm({ ...form, id: e.target.value.toLowerCase().replace(/\s+/g, '-') })} disabled={!isNew} placeholder="e.g. action-packed" required />
          </div>
          <div>
            <label className="form-label">{t('admin.moods.colTh')} *</label>
            <input className="form-input" value={form.name_th} onChange={e => setForm({ ...form, name_th: e.target.value })} placeholder="เช่น ตื่นเต้น" required />
          </div>
          <div>
            <label className="form-label">{t('admin.moods.colEn')} *</label>
            <input className="form-input" value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} placeholder="e.g. Exciting" required />
          </div>
          <div>
            <label className="form-label">{t('admin.moods.colIcon')}</label>
            <input className="form-input" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="🔥" />
          </div>
          <div>
            <label className="form-label">{t('admin.moods.colColor')}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="color" value={form.color || '#7c3aed'} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: '40px', height: '38px', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px', cursor: 'pointer' }} />
              <input className="form-input" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="#7c3aed" />
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">คำอธิบาย</label>
            <textarea className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows="2" placeholder="อธิบายสั้นๆ เกี่ยวกับอารมณ์นี้..." />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)', justifyContent: 'flex-end' }}>
          <button className="action-btn" type="button" onClick={onCancel}>{t('admin.common.cancel')}</button>
          <button className="primary-btn" type="button" onClick={() => onSave(form)}>
            💾 {isNew ? t('admin.common.add') : t('admin.common.save')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>🎭 {t('admin.moods.pageTitle')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>จัดการหมวดหมู่อารมณ์ที่ใช้เชื่อมโยงกับเนื้อหาเพื่อระบบแนะนำ ({moods.length} รายการ)</p>
        </div>
        {!showAddForm && !editingMood && (
          <button className="primary-btn" onClick={() => setShowAddForm(true)}>
            ➕ {t('admin.moods.newMood')}
          </button>
        )}
      </div>

      {showAddForm && (
        <MoodForm
          mood={newMood}
          onSave={handleSaveMood}
          onCancel={() => setShowAddForm(false)}
          isNew={true}
        />
      )}

      {editingMood && (
        <MoodForm
          mood={editingMood}
          onSave={handleSaveMood}
          onCancel={() => setEditingMood(null)}
          isNew={false}
        />
      )}

      <div className="admin-table-container">
        {isLoading ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>{t('admin.moods.loading')}</div>
        ) : moods.length === 0 ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('admin.moods.noData')}</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>{t('admin.moods.colIcon')}</th>
                <th>{t('admin.moods.colId')}</th>
                <th>{t('admin.moods.colTh')}</th>
                <th>{t('admin.moods.colEn')}</th>
                <th>{t('admin.moods.colColor')}</th>
                <th style={{ textAlign: 'right' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {moods.map(mood => (
                <tr key={mood.id}>
                  <td style={{ fontSize: '1.5rem', textAlign: 'center' }}>{mood.icon || '🏷️'}</td>
                  <td><code style={{ background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--primary-700)' }}>{mood.id}</code></td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{mood.name_th}</td>
                  <td>{mood.name_en}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: mood.color || '#ccc', border: '1px solid var(--border-default)' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{mood.color}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="action-btn" onClick={() => { setEditingMood(mood); setShowAddForm(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} title={t('admin.common.edit')}>✏️</button>
                      <button className="action-btn" style={{ color: 'var(--error)' }} onClick={() => handleDeleteMood(mood.id, mood.name_en)} title={t('admin.common.delete')}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminMoods;
