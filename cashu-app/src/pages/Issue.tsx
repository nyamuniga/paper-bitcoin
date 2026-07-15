import { useState } from 'react';
import { IssuedNoteSuccess } from '../components/issue/IssuedNoteSuccess';
import { InvoicePaymentPending } from '../components/issue/InvoicePaymentPending';
import { IssueAmountStep } from '../components/issue/IssueAmountStep';
import { IssueMintsStep } from '../components/issue/IssueMintsStep';
import { IssueSummaryStep } from '../components/issue/IssueSummaryStep';
import { IssueLoadingStep } from '../components/issue/IssueLoadingStep';
import { useIssue } from '../hooks/useIssue';

import { WalletPaymentPending } from '../components/issue/WalletPaymentPending';

export const Issue = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const {
    sats,
    setSats,
    mintUrls,
    setMintUrls,
    strategy,
    setStrategy,
    fundMethod,
    setFundMethod,
    loading,
    invoicePayload,
    issuedNote,
    error,
    setError,
    debugLogs,
    handleIssue,
    handleCheckStatus
  } = useIssue();

  if (issuedNote) {
    return (
      <IssuedNoteSuccess 
        issuedNote={issuedNote}
        error={error}
        onError={setError}
      />
    );
  }

  if (invoicePayload) {
    if (fundMethod === 'wallet') {
      return (
        <WalletPaymentPending
          invoicePayload={invoicePayload}
          error={error}
          debugLogs={debugLogs}
        />
      );
    }
    return (
      <InvoicePaymentPending
        invoicePayload={invoicePayload}
        loading={loading}
        onCheckStatus={handleCheckStatus}
        error={error}
        onError={setError}
        debugLogs={debugLogs}
      />
    );
  }

  const isProcessing = loading || (!invoicePayload && !issuedNote && error);

  if (isProcessing && step === 3) {
    return (
      <IssueLoadingStep
        debugLogs={debugLogs}
        error={error}
        onBack={() => setError('')}
      />
    );
  }

  if (step === 1) {
    return (
      <IssueAmountStep
        sats={sats}
        setSats={setSats}
        onNext={() => setStep(2)}
      />
    );
  }

  if (step === 2) {
    return (
      <IssueMintsStep
        mintUrls={mintUrls}
        setMintUrls={setMintUrls}
        onNext={() => setStep(3)}
        onBack={() => setStep(1)}
      />
    );
  }

  return (
    <IssueSummaryStep
      sats={sats}
      mintUrls={mintUrls}
      strategy={strategy}
      setStrategy={setStrategy}
      fundMethod={fundMethod}
      setFundMethod={setFundMethod}
      loading={loading}
      onIssue={handleIssue}
      onBack={() => setStep(2)}
    />
  );
};
