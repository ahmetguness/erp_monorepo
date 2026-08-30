'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useCreateContact } from '@/hooks/useContacts';
import type { ContactType } from '@/services/contact.service';

interface QuickCreateContactModalProps {
  isOpen: boolean;
  suggestedType: ContactType;
  onClose: () => void;
  onCreated: (contactId: string) => void;
}

export function QuickCreateContactModal({ isOpen, suggestedType, onClose, onCreated }: QuickCreateContactModalProps) {
  const createContact = useCreateContact();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<ContactType>(suggestedType);

  const submit = () => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    createContact.mutate({ type, name: normalizedName, email: email.trim() || undefined }, {
      onSuccess: (contact) => {
        onCreated(contact.id);
        setName(''); setEmail(''); onClose();
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hızlı cari oluştur" description="Faturadan ayrılmadan gerekli cariyi oluşturun." size="sm" footer={<><Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button onClick={submit} loading={createContact.isPending} disabled={!name.trim()}>Oluştur ve seç</Button></>}>
      <div className="space-y-4">
        <Select label="Cari türü" value={type} onChange={(event) => setType(event.target.value as ContactType)} options={[{ value: 'CUSTOMER', label: 'Müşteri' }, { value: 'SUPPLIER', label: 'Tedarikçi' }, { value: 'BOTH', label: 'Müşteri ve tedarikçi' }]} />
        <Input label="Unvan / ad" required value={name} onChange={(event) => setName(event.target.value)} />
        <Input label="E-posta" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
    </Modal>
  );
}
