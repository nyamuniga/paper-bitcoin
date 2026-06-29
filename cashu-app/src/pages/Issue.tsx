import { IssuedNoteSuccess } from '../components/issue/IssuedNoteSuccess';
import { InvoicePaymentPending } from '../components/issue/InvoicePaymentPending';
import { IssueNoteForm } from '../components/issue/IssueNoteForm';
import { useIssue } from '../hooks/useIssue';

export const Issue = () => {
  const {
    sats,
    setSats,
    mintUrls,
    setMintUrls,
    strategy,
    setStrategy,
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

  return (
    <IssueNoteForm
      sats={sats}
      setSats={setSats}
      mintUrls={mintUrls}
      setMintUrls={setMintUrls}
      strategy={strategy}
      setStrategy={setStrategy}
      loading={loading}
      onIssue={handleIssue}
      error={error}
      debugLogs={debugLogs}
    />
  );
};
