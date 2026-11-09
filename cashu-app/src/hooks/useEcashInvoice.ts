import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { createInvoice, invoiceQrWithRelays } from '../services/ecashInvoice';
import type { EcashInvoice } from '../services/ecashInvoice';
import { openInvoiceInbox } from '../services/invoiceInbox';
import { invoiceSecret, loadEcashInvoice, saveEcashInvoice, saveInvoicePayment, DEFAULT_INVOICE_RELAYS, addInvoiceRelays } from '../services/savedEcashInvoices';
import { useWalletStore } from '../store/wallet';
import { InvoiceRelayConnectionError } from '../services/nostrInvoiceTransport';
const RELAYS = DEFAULT_INVOICE_RELAYS;
export function useEcashInvoice(mint: string, onPaid: (amount: number) => void, invoiceId?: string) {
    const [invoice, setInvoice] = useState<EcashInvoice | null>(null);
    const [description, setDescription] = useState('');
    const [qrReady, setQrReady] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [paid, setPaid] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [deliveryDetails, setDeliveryDetails] = useState<string[]>([]);
    const [retryToken, setRetryToken] = useState<string | null>(null);
    const active = useRef<{
        close: () => void;
    } | null>(null);
    const generation = useRef(0);
    const selectedId = useRef<string | undefined>(invoiceId);
    const mounted = useRef(false);
    const processing = useRef(false);
    const receivedToken = useRef<string | null>(null);
    const paidCallback = useRef(onPaid);
    paidCallback.current = onPaid;
    const current = (id: number) => mounted.current && id === generation.current;
    // Pausing closes sockets and clears only the in-memory key. The encrypted request survives.
    const pause = () => {
        generation.current++;
        active.current?.close();
        active.current = null;
        receivedToken.current = null;
    };
    const accept = async (token: string, selected: EcashInvoice, id: number) => {
        if (processing.current || !current(id))
            return;
        if (receivedToken.current && receivedToken.current !== token)
            return;
        receivedToken.current = token;
        processing.current = true;
        setClaiming(true);
        setRetryToken(token);
        setError('');setDeliveryDetails([]);
        setMessage('Payment arrived. Saving it before redeeming with your mint…');
        try {
            await saveInvoicePayment(selected.id, token);
            const amount = await invoke<number>('receive_ecash', {
                tokenString: token, expectedMint: selected.mint, expectedAmount: selected.amount, expectedInvoiceId: selected.id,
            });
            await useWalletStore.getState().refreshWallet().catch(() => { });
            if (current(id)) {
                setRetryToken(null);
                setPaid(true);
                setQrReady(false);
                pause();
                setMessage('Paid. Ecash has been added to your balance.');
                paidCallback.current(amount);
            }
        }
        catch (e) {
            if (current(id)) {
                setError(String(e));
                setMessage('Payment is not confirmed. Retry claiming this token; the request is saved in History.');
            }
        }
        finally {
            processing.current = false;
            if (mounted.current)
                setClaiming(false);
        }
    };
    const listen = (selected: EcashInvoice, secret: Uint8Array, relays: string[], id: number) => {
        const pubkey = getPublicKey(secret);
        const updateRoutes = (readyRelays: string[]) => {
            if (!current(id) || receivedToken.current) return;
            setQrReady(readyRelays.length > 0);
            if (readyRelays.length) {
                setInvoice({...selected, qr:invoiceQrWithRelays(selected, pubkey, readyRelays)});
                setError('');setDeliveryDetails([]);
                setMessage('Waiting for payment. This request is saved in History.');
            }
        };
        const inbox = openInvoiceInbox(selected, secret, relays, token => { void accept(token, selected, id); }, () => {
            if (current(id)) {
                setQrReady(false);
                setError('Delivery disconnected. Check status to reconnect to this request.');
            }
        }, reason => { if (current(id) && !receivedToken.current) {
            setError(reason);
            setMessage('A message arrived, but payment is not confirmed.');
        } }, updateRoutes);
        active.current = { close: inbox.close };
        void inbox.ready.then(updateRoutes).catch(e => {
            if (current(id)) {
                setError(e instanceof Error ? e.message : String(e));
                setDeliveryDetails(e instanceof InvoiceRelayConnectionError ? e.details : []);
            }
        });
    };
    const resume = async (requestId: string) => {
        if (processing.current)
            return;
        pause();
        const id = generation.current;
        selectedId.current = requestId;
        setLoading(true);
        setQrReady(false);
        setPaid(false);
        setRetryToken(null);
        setError('');setDeliveryDetails([]);
        setMessage('Checking saved request and payment inbox…');
        try {
            const saved = await loadEcashInvoice(requestId);
            if (!current(id))
                return;
            const selected = { id: saved.id, amount: saved.amount, mint: saved.mint, qr: saved.qr };
            setInvoice(selected);
            setDescription(saved.description);
            if (saved.status === 'paid') {
                setPaid(true);
                setMessage('Paid. Ecash has been added to your balance.');
                return;
            }
            if (saved.pending_token) {
                setRetryToken(saved.pending_token);
                receivedToken.current = saved.pending_token;
                setMessage('A payment is saved. Retry claiming it to confirm the balance.');
                return;
            }
            // Retain original delivery routes, and save fallbacks before showing an updated QR.
            const relays = await addInvoiceRelays(saved.id);
            if (current(id)) listen(selected, invoiceSecret(saved), relays, id);
        }
        catch (e) {
            if (current(id))
                setError(String(e));
        }
        finally {
            if (current(id))
                setLoading(false);
        }
    };
    useEffect(() => {
        mounted.current = true;
        const visibility = () => {
            if (document.hidden) {
                pause();
                setQrReady(false);
                setLoading(false);
            }
            else if (selectedId.current) {
                void resume(selectedId.current);
            }
        };
        document.addEventListener('visibilitychange', visibility);
        const online = () => {if (selectedId.current) void resume(selectedId.current);};
        window.addEventListener('online', online);
        return () => { mounted.current = false; pause(); document.removeEventListener('visibilitychange', visibility);window.removeEventListener('online', online); };
    }, [invoiceId]);
    useEffect(() => {
        pause();
        selectedId.current = invoiceId;
        setInvoice(null);
        setRetryToken(null);
        setPaid(false);
        setError('');setDeliveryDetails([]);
        setMessage('');
        setQrReady(false);
        if (invoiceId)
            void resume(invoiceId);
    }, [mint, invoiceId]);
    const create = async (amount: number, requestedDescription: string) => {
        if (processing.current || loading)
            return;
        pause();
        const id = generation.current;
        setLoading(true);
        setError('');setDeliveryDetails([]);
        setRetryToken(null);
        setPaid(false);
        setQrReady(false);
        const secret = generateSecretKey();
        try {
            const selected = createInvoice(amount, mint, requestedDescription, getPublicKey(secret), RELAYS);
            // Never show a payable QR until the receiving key is durably encrypted on disk.
            await saveEcashInvoice(selected, requestedDescription, secret, RELAYS);
            void useWalletStore.getState().refreshWallet().catch(() => {});
            if (!current(id)) {
                secret.fill(0);
                return;
            }
            selectedId.current = selected.id;
            setInvoice(selected);
            setDescription(requestedDescription);
            listen(selected, secret, RELAYS, id);
        }
        catch (e) {
            secret.fill(0);
            if (current(id))
                setError(String(e));
        }
        finally {
            if (current(id))
                setLoading(false);
        }
    };
    return { invoice, description, deliveryDetails, qrReady, claiming, loading, paid, error, message, retryToken, create,
        retry: () => { if (retryToken && invoice)
            void accept(retryToken, invoice, generation.current); },
        checkStatus: () => { if (invoice)
            void resume(invoice.id);
        else if (invoiceId)
            void resume(invoiceId); },
        newRequest: () => { if (processing.current)
            return; pause(); selectedId.current = undefined; setInvoice(null); setQrReady(false); setRetryToken(null); setError('');setDeliveryDetails([]); setMessage(''); setPaid(false); },
    };
}
