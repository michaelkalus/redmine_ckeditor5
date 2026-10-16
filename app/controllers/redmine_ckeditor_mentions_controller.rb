# frozen_string_literal: true

class RedmineCkeditorMentionsController < ApplicationController
  LIMIT = 10
  BATCH = 50
  MAX_BATCHES = 20
  MAX_QUERY = 100
  MAX_TOKENS = 5

  before_action :require_login
  before_action :ensure_enabled
  before_action :find_context

  def users
    render json: suggested_users.map { |user| {login: user.login, name: user.name} }
  end

  private

  def ensure_enabled
    render_404 unless RedmineCkeditorSetting.mention_users?
  end

  def find_context
    if params[:issue_id].present?
      @issue = Issue.visible.find_by(id: params[:issue_id])
      return render_404 unless @issue

      @project = @issue.project
    else
      @project = Project.visible.find_by_param(params[:project_id])
      return render_404 unless @project
    end
    deny_access unless User.current.allowed_to?(:view_issues, @project)
  end

  def suggested_users
    scope = candidate_scope
    found = []
    offset = 0
    MAX_BATCHES.times do
      batch = scope.offset(offset).limit(BATCH).to_a
      batch.each { |user| found << user if may_see?(user) }
      break if found.size >= LIMIT || batch.size < BATCH

      offset += BATCH
    end
    found.first(LIMIT)
  end

  def may_see?(user)
    @issue ? @issue.visible?(user) : user.allowed_to?(:view_issues, @project)
  end

  def candidate_scope
    scope = User.visible.active.where(id: Member.where(project_id: @project.id).select(:user_id))
    query = params[:q].to_s.first(MAX_QUERY).strip
    scope = scope.where(*name_condition(query)) if query.present?
    scope.sorted
  end

  def name_condition(query)
    table = User.table_name
    values = {whole: like_pattern(query)}
    token_sql = query.split(/\s+/).first(MAX_TOKENS).each_with_index.map do |token, index|
      values[:"t#{index}"] = like_pattern(token)
      "(LOWER(#{table}.firstname) LIKE :t#{index} ESCAPE '!' OR LOWER(#{table}.lastname) LIKE :t#{index} ESCAPE '!')"
    end
    ["(LOWER(#{table}.login) LIKE :whole ESCAPE '!') OR (#{token_sql.join(' AND ')})", values]
  end

  def like_pattern(text)
    "%#{User.sanitize_sql_like(text.downcase, '!')}%"
  end
end
