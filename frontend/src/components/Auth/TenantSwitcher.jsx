import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setActiveTenant } from '../../store/slices/authSlice'
import { FiHome, FiChevronDown } from 'react-icons/fi'

function TenantSwitcher() {
  const { tenants, activeTenant } = useSelector((state) => state.auth)
  const dispatch = useDispatch()

  if (tenants.length <= 1) return null

  const currentTenant = tenants.find((t) => t.id === activeTenant) || tenants[0]

  return (
    <div className="px-4 py-3 border-b border-gray-200">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
        Active Tenant
      </label>
      <div className="relative">
        <select
          value={activeTenant || ''}
          onChange={(e) => dispatch(setActiveTenant(e.target.value))}
          className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 appearance-none cursor-pointer"
        >
          {tenants.map((tenantWrap) => (
            <option key={tenantWrap.tenant.id} value={tenantWrap.tenant.id}>
              {tenantWrap.tenant.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
          <FiChevronDown />
        </div>
      </div>
    </div>
  )
}

export default TenantSwitcher
