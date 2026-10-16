# frozen_string_literal: true

module RedmineCkeditor
  module HtmlMentionText
    SKIPPED = %w[pre code blockquote script style].freeze
    BLOCKS = %w[p div li br h1 h2 h3 h4 h5 h6 td th tr table ul ol figure figcaption hr].freeze

    module_function

    def call(html)
      return '' if html.blank?

      out = +''
      walk(Nokogiri::HTML5.fragment(html.to_s), out)
      out
    end

    def walk(node, out)
      node.children.each do |child|
        if child.text?
          out << child.text
        elsif child.element?
          name = child.name.downcase
          next if SKIPPED.include?(name)

          block = BLOCKS.include?(name)
          out << "\n" if block
          walk(child, out)
          out << "\n" if block
        end
      end
    end
  end
end
