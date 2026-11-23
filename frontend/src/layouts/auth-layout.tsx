import { Outlet } from 'react-router'
import { BrandMark } from './sidebar'

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <BrandMark />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} CorporateOS. Internal use only.</p>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-zinc-950 lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-12 text-zinc-100">
          <p className="text-xs font-medium tracking-[0.2em] text-zinc-400 uppercase">Enterprise Operations Platform</p>
          <h2 className="mt-4 max-w-md text-3xl leading-tight font-semibold">
            One place for people, projects, approvals and company knowledge.
          </h2>
          <ul className="mt-8 grid max-w-md grid-cols-2 gap-3 text-sm text-zinc-400">
            <li>· Workforce & org structure</li>
            <li>· Projects & task boards</li>
            <li>· Leave & expense approvals</li>
            <li>· Reports & audit trail</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
