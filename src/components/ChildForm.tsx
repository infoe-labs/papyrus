import { BackupSettings } from '../backup/components/BackupSettings';
import { useState } from 'react';
import { format } from 'date-fns';
import { Check, Leaf } from 'lucide-react';
import { uid, type Child } from '../lib/model';
import { saveChild } from '../lib/db';
import { useUI } from '../lib/store';
export function ChildForm({
  child,
  onSaved,
  onCancel,
}: {
  child?: Child;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(child?.name ?? '');
  const [dob, setDob] = useState(child?.dob ?? format(new Date(), 'yyyy-MM-dd'));
  const [sex, setSex] = useState<Child['sex']>(child?.sex ?? 'unspecified');
  const [gestation, setGestation] = useState(child?.gestationWeeks ?? 40);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(child?.photo);
  const { setChild } = useUI();
  return (
    <form
      className="child-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (dob > format(new Date(), 'yyyy-MM-dd'))
            throw Error('Date of birth cannot be in the future.');
          const id = child?.id ?? uid();
          await saveChild({
            id,
            name: name.trim(),
            dob,
            sex,
            gestationWeeks: gestation,
            createdAt: child?.createdAt ?? Date.now(),
            photo,
          });
          setChild(id);
          onSaved();
        } catch (err) {
          setError(String(err));
        }
      }}
    >
      <div className="form-grid">
        <label>
          First name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their little name"
          />
        </label>
        <label>
          Date of birth
          <input
            required
            type="date"
            max={format(new Date(), 'yyyy-MM-dd')}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </label>
        <label>
          Sex for growth reference
          <select value={sex} onChange={(e) => setSex(e.target.value as Child['sex'])}>
            <option value="unspecified">Not selected</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
        <label>
          Gestational age at birth · weeks
          <input
            type="number"
            step="0.1"
            min="20"
            max="45"
            value={gestation}
            onChange={(e) => setGestation(Number(e.target.value))}
          />
        </label>
        <label className="full">
          Optional profile photo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size < 5000000) {
                const r = new FileReader();
                r.onload = () => setPhoto(String(r.result));
                r.readAsDataURL(f);
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="inline-form">
        {onCancel && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="button" type="submit">
          <Check size={17} />
          {child ? 'Save profile' : 'Create profile'}
        </button>
      </div>
    </form>
  );
}
export function Welcome() {
  const [importChoice, setImportChoice] = useState(false);
  return (
    <main className="welcome">
      <div className="welcome-brand">
        <Leaf size={28} /> papyrus<span>✳</span>
      </div>
      <section className="card welcome-card">
        <p className="eyebrow">A LITTLE PLACE FOR YOUR LITTLE ONE</p>
        <h1>
          Every little moment
          <br />
          starts a story.
        </h1>
        <p className="muted">
          Sleepy afternoons. Tiny firsts. All the details that make up a life. Keep them here,
          privately on your device.
        </p>
        {importChoice && (
          <p className="info">
            Create the destination child's profile below. The CSV importer will open next.
          </p>
        )}
        <ChildForm
          onSaved={() => {
            if (importChoice) {
              sessionStorage.setItem('papyrus-onboarding-import', 'true');
              location.hash = '/settings';
            }
          }}
        />
        <p className="privacy-line">No account. No subscription. Just your family.</p>
      </section>
      <div className="welcome-recovery">
        <BackupSettings compact />
        <button
          className="button secondary"
          onClick={() => {
            setImportChoice(true);
            window.scrollTo({ top: 0, left: 0 });
          }}
        >
          Import Huckleberry CSV
        </button>
        <p className="muted small">
          To import Huckleberry CSV, create or select the destination child profile above, then open
          Settings → Import. No empty child profile is fabricated.
        </p>
      </div>
    </main>
  );
}
