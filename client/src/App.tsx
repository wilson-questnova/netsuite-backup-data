import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface PurchaseOrder {
  internal_id: string;
  transaction_date: string;
  entity_name: string;
  document_number: string;
  status: string;
  item_name: string;
  quantity: number;
  amount: number;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
const api = axios.create({ baseURL: API_BASE_URL });

function App() {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [recordType, setRecordType] = useState<'PO' | 'VP' | 'INV' | 'IR' | 'VB' | 'SO'>('PO');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<null | {
    header: { internal_id: string; transaction_date: string; entity_name: string; document_number: string; status: string; location?: string | null; supplier_reference_no?: string | null };
    lines: { item: string; quantity: number; rate?: number; srp?: number; discount?: string; amount: number }[];
    totals: { total_qty: number; total_amount: number };
  }>(null);
  const [auth, setAuth] = useState<{ user: string; pass: string } | null>(null);
  const [userInput, setUserInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    // Simple persistence so refresh keeps credentials until tab close
    const u = sessionStorage.getItem('basic_user');
    const p = sessionStorage.getItem('basic_pass');
    if (u && p) setAuth({ user: u, pass: p });
  }, []);

  useEffect(() => {
    if (auth) {
      sessionStorage.setItem('basic_user', auth.user);
      sessionStorage.setItem('basic_pass', auth.pass);
    }
  }, [auth]);

  const authHeader = auth ? 'Basic ' + btoa(`${auth.user}:${auth.pass}`) : '';
  const logout = () => {
    sessionStorage.removeItem('basic_user');
    sessionStorage.removeItem('basic_pass');
    setAuth(null);
    setUserInput('');
    setPassInput('');
    setLoginError(null);
    setLoginBusy(false);
    setSearch('');
    setStartDate('');
    setEndDate('');
    setStatus('');
    setStatuses([]);
    setPage(1);
    setData([]);
    setMeta({ total: 0, page: 1, limit: 50, totalPages: 0 });
    setDetailOpen(false);
    setDetail(null);
  };

  const attemptLogin = async () => {
    const username = userInput.trim();
    const password = passInput;

    if (!username && !password) {
      setLoginError('Please enter your username and password.');
      return;
    }
    if (!username) {
      setLoginError('Please enter your username.');
      return;
    }
    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setLoginBusy(true);
    setLoginError(null);
    const header = 'Basic ' + btoa(`${username}:${password}`);
    try {
      await api.get('/api/auth/me', {
        headers: { Authorization: header },
      });
      sessionStorage.setItem('basic_user', username);
      sessionStorage.setItem('basic_pass', password);
      setAuth({ user: username, pass: password });
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        setLoginError('Invalid username or password.');
      } else {
        setLoginError('Unable to reach the server. Please try again.');
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const fetchData = async (pageNum: number, searchQuery: string, start: string, end: string, statusFilter: string) => {
    setLoading(true);
    try {
      let path = '/api/purchase-orders';
      if (recordType === 'VP') path = '/api/vendor-payments';
      if (recordType === 'INV') path = '/api/invoices';
      if (recordType === 'IR') path = '/api/item-receipts';
      if (recordType === 'VB') path = '/api/vendor-bills';
      if (recordType === 'SO') path = '/api/sales-orders';
      
      const response = await api.get(path, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
        params: {
          page: pageNum,
          limit: 50,
          search: searchQuery,
          startDate: start,
          endDate: end,
          status: statusFilter
        }
      });
      setData(response.data.data);
      setMeta(response.data.meta);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        logout();
        setLoginError('Session expired. Please sign in again.');
        return;
      }
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(() => {
      setPage(1); // Reset to page 1 on search
      fetchData(1, search, startDate, endDate, status);
    }, 500);
    return () => clearTimeout(timer);
  }, [auth, search, startDate, endDate, status, recordType]);

  // Handle page change
  useEffect(() => {
    if (!auth) return;
    fetchData(page, search, startDate, endDate, status);
  }, [auth, page]);

  useEffect(() => {
    if (!auth) return;
    let statusesPath = '/api/purchase-orders-statuses';
    if (recordType === 'VP') statusesPath = '/api/vendor-payments-statuses';
    if (recordType === 'INV') statusesPath = '/api/invoices-statuses';
    if (recordType === 'IR') statusesPath = '/api/item-receipts-statuses';
    if (recordType === 'VB') statusesPath = '/api/vendor-bills-statuses';
    if (recordType === 'SO') statusesPath = '/api/sales-orders-statuses';
    
    api
      .get(statusesPath, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      })
      .then((res) => setStatuses(res.data.statuses || []))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          logout();
          setLoginError('Session expired. Please sign in again.');
          return;
        }
        console.error('Failed to load statuses', err);
      });
  }, [auth, authHeader, recordType]);

  useEffect(() => {
    if (!detailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailOpen(false);
        setDetail(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailOpen]);

  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm bg-white p-6 rounded-lg shadow space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
          {loginError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {loginError}
            </div>
          )}
          <div className="space-y-2">
            <input
              placeholder="Username"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />
            <input
              placeholder="Password"
              type="password"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') attemptLogin();
              }}
            />
          </div>
          <button
            className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm disabled:opacity-50"
            onClick={attemptLogin}
            disabled={loginBusy}
          >
            {loginBusy ? 'Signing in…' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  const openDetail = async (docNumber: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      let detailPath = `/api/purchase-orders/${encodeURIComponent(docNumber)}`;
      if (recordType === 'VP') detailPath = `/api/vendor-payments/${encodeURIComponent(docNumber)}`;
      if (recordType === 'INV') detailPath = `/api/invoices/${encodeURIComponent(docNumber)}`;
      if (recordType === 'IR') detailPath = `/api/item-receipts/${encodeURIComponent(docNumber)}`;
      if (recordType === 'VB') detailPath = `/api/vendor-bills/${encodeURIComponent(docNumber)}`;
      if (recordType === 'SO') detailPath = `/api/sales-orders/${encodeURIComponent(docNumber)}`;
      
      const res = await api.get(detailPath, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
      setDetail(res.data);
    } catch (e) {
      console.error('Failed to load detail', e);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {recordType === 'PO' ? 'Purchase Orders Viewer' : recordType === 'VP' ? 'Vendor Payments Viewer' : recordType === 'INV' ? 'Invoices Viewer' : recordType === 'IR' ? 'Item Receipts Viewer' : recordType === 'VB' ? 'Vendor Bills Viewer' : 'Sales Orders Viewer'}
          </h1>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Total Records: <span className="font-semibold">{meta.total.toLocaleString()}</span>
            </div>
            <button
              className="text-sm text-gray-600 hover:text-gray-900"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white p-4 rounded-lg shadow space-y-4 sm:space-y-0 sm:flex sm:items-center sm:space-x-4">
          <div>
            <label htmlFor="recordType" className="sr-only">Record Type</label>
            <select
              id="recordType"
              className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-md leading-5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={recordType}
              onChange={(e) => { setRecordType(e.target.value as 'PO' | 'VP'); setPage(1); }}
            >
              <option value="PO">Purchase Orders</option>
              <option value="VP">Vendor Payments</option>
              <option value="INV">Invoices</option>
              <option value="IR">Item Receipts</option>
              <option value="VB">Vendor Bills</option>
              <option value="SO">Sales Orders</option>
            </select>
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder={
                recordType === 'PO'
                  ? 'Search by Document Number, Supplier, or Item...'
                  : recordType === 'IR'
                  ? 'Search by Document Number, Company, or Item...'
                  : recordType === 'VB'
                  ? 'Search by Document Number, Supplier, or Item...'
                  : recordType === 'SO'
                  ? 'Search by Document Number, Customer, or Item...'
                  : 'Search by Document Number, Vendor/Customer, or Item...'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex space-x-2">
            <div>
              <label htmlFor="startDate" className="sr-only">Start Date</label>
              <input
                type="date"
                id="startDate"
                className="block w-full pl-3 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center text-gray-400">-</div>
            <div>
              <label htmlFor="endDate" className="sr-only">End Date</label>
              <input
                type="date"
                id="endDate"
                className="block w-full pl-3 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="status" className="sr-only">Status</label>
              <select
                id="status"
                className="block w-full pl-3 pr-8 py-2 border border-gray-300 rounded-md leading-5 bg-white text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All Status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc Num</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{recordType === 'PO' || recordType === 'VB' ? 'Supplier' : recordType === 'IR' ? 'Company' : 'Customer'}</th>
                  {(recordType === 'PO' || recordType === 'INV' || recordType === 'IR' || recordType === 'VB' || recordType === 'SO') && (
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                  )}
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                      <div className="flex justify-center items-center">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        <span className="ml-2">Loading...</span>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  data.map((row, idx) => (
                    <tr key={`${row.internal_id}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.transaction_date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          className="text-indigo-600 hover:underline"
                          onClick={() => openDetail(row.document_number)}
                        >
                          {row.document_number}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[200px] truncate" title={row.entity_name}>{row.entity_name}</td>
                      {(recordType === 'PO' || recordType === 'INV' || recordType === 'IR') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.quantity}</td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">
                        {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(row.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          row.status === 'Closed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 shadow sm:rounded-lg">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing page <span className="font-medium">{page}</span> of <span className="font-medium">{meta.totalPages}</span>
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                  disabled={page === meta.totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setDetailOpen(false); setDetail(null); }}
        >
          <div
            className="bg-white w-full max-w-3xl rounded-lg shadow-lg overflow-hidden max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">{recordType === 'PO' ? 'Purchase Order Details' : recordType === 'VP' ? 'Vendor Payment Details' : recordType === 'INV' ? 'Invoice Details' : recordType === 'IR' ? 'Item Receipt Details' : recordType === 'VB' ? 'Vendor Bill Details' : 'Sales Order Details'}</h2>
                <button className="text-gray-500 hover:text-gray-700" onClick={() => { setDetailOpen(false); setDetail(null); }}>
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...
                </div>
              ) : detail ? (
                <>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-6 bg-gray-50 p-4 rounded-lg">
                    <div><span className="text-gray-500">Doc Num:</span> <span className="font-medium">{detail.header.document_number}</span></div>
                    <div><span className="text-gray-500">Date:</span> <span className="font-medium">{detail.header.transaction_date}</span></div>
                    {recordType === 'IR' ? (
                      <>
                        <div><span className="text-gray-500">Supplier:</span> <span className="font-medium">{detail.header.entity_name}</span></div>
                        <div><span className="text-gray-500">Supplier Ref No.:</span> <span className="font-medium">{detail.header.supplier_reference_no || ''}</span></div>
                      </>
                    ) : (
                      <div>
                        <span className="text-gray-500">
                          {recordType === 'PO' ? 'Supplier:' : recordType === 'VP' ? 'Vendor:' : 'Customer:'}
                        </span>
                        <span className="font-medium">{detail.header.entity_name}</span>
                      </div>
                    )}
                    <div><span className="text-gray-500">Status:</span> <span className="font-medium">{detail.header.status}</span></div>
                    {detail.header.location ? (
                      <div className="col-span-2"><span className="text-gray-500">Location:</span> <span className="font-medium">{detail.header.location}</span></div>
                    ) : null}
                  </div>
                  <div className="border rounded">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">SRP</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Discount</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {detail.lines.map((ln, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">{ln.item}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 text-right font-mono">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(ln.rate ?? 0)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900 text-right font-mono">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(ln.srp ?? 0) || 0)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500 text-right">{ln.discount ?? ''}</td>
                            <td className="px-4 py-2 text-sm text-gray-500 text-right">{ln.quantity}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 text-right font-mono">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(ln.amount || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50">
                          <td className="px-4 py-2 text-right text-sm font-semibold">Totals</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{detail.totals?.total_qty ?? 0}</td>
                          <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 font-mono">
                            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(detail.totals?.total_amount ?? 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">No details to display.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
